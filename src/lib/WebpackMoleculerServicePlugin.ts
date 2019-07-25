import fs from 'fs';
import cloneDeep from 'lodash.clonedeep';
import path from 'path';
import YAML from 'yaml';

import { MSPluginOptions, MSPluginRule, MSPluginRuleConfigs, Template } from 'webpack-moleculer-service-plugin';

const ERR_REQUIRE_TEMPLATE = 'Could not found any templates';
const DEFAULT_SERVICE_MASK = /^services\/.*\/.*service\.js$/;

interface TemplateMap {
  [key: string]: Template
}

interface ServiceRule {
  [serviceName: string]: MSPluginRule
}

export class WebpackMoleculerServicePlugin {
  private options: MSPluginOptions;
  private templates: Template[];
  private templateMap: TemplateMap;
  private encoding: string;
  private servicePattern: RegExp;
  private rules: MSPluginRuleConfigs;
  private outputDir: string;
  private notifyComplete: (outputDir: string, services: string[], servicePaths: string[]) => void;

  constructor(options: MSPluginOptions) {
    this.options = options;
    const { templates, templateDir, encoding, mask, rules, output, complete } = this.options;
    if (!templates && !templateDir) {
      throw new Error(ERR_REQUIRE_TEMPLATE);
    }
    this.encoding = encoding || 'utf8';
    this.servicePattern = mask ? mask instanceof RegExp ? mask : new RegExp(mask) : DEFAULT_SERVICE_MASK;
    this.rules = this.normalizeRules(rules ? rules : { '.*': { template: 'default' } });
    this.notifyComplete = complete;
    this.outputDir = output;
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir);
    }

    if (templateDir) {
      const tmplFiles = fs.readdirSync(templateDir);
      this.templates = [
        ...tmplFiles.map(f => {
          const filename = path.basename(f);
          const ext = path.extname(f);
          const template = fs.readFileSync(path.resolve(templateDir, f), { encoding: this.encoding });
          const parsed = YAML.parse(template);
          const tmpl: Template = {
            name: filename.replace(ext, ''),
            template,
            parsed
          };
          return tmpl;
        })
      ];
    }

    if (templates && templates.length) {
      this.templates = [
        ...templates.reduce((carries: Template[], t: Template): Template[] => {
          if (t.template) {
            carries.push({
              ...t,
              parsed: YAML.parse(t.template),
            });
          } else if (t.path) {
            const template = fs.readFileSync(t.path, { encoding: this.encoding });
            const parsed = YAML.parse(template);
            carries.push({
              name: t.name,
              template,
              parsed
            })
          }
          return carries;
        }, [])
      ];
    }

    this.templateMap = {
      ...this.templates.reduce((carries: TemplateMap, t: Template) => {
        carries[t.name] = t; // override if existed
        return carries;
      }, {})
    }
  }

  public apply(compiler) {
    compiler.hooks.afterEmit.tap('WebpackMoleculerServicePlugin', ({ assets }) => {
      const assetKeys = Object.keys(assets);
      const serviceFiles = assetKeys.filter(k => this.servicePattern.test(k));
      const ruleKeys = Object.keys(this.rules);
      const hasAllKey = ruleKeys.some(k => k === '.*');
      const otherRuleKeys = ruleKeys.filter(r => r !== '.*');
      const services: ServiceRule = {};

      serviceFiles.forEach(sf => {
        const rule = otherRuleKeys.find(rKey => new RegExp(rKey).test(sf));
        const serviceName = this.getServiceName(sf);
        if (rule) {
          services[serviceName] = this.rules[rule];
        } else if (hasAllKey) {
          services[serviceName] = this.rules['.*'];
        }
      });

      this.generateComposeFiles(services);
    });
  }

  private normalizeRules(rules: MSPluginRuleConfigs): MSPluginRuleConfigs {
    const keys = Object.keys(rules);
    return keys.reduce(
      (carries: MSPluginRuleConfigs, k: string) => ({ ...carries, [k === '*' ? '.*' : k]: rules[k] }),
      {}
    );
  }

  private getServiceName(serviceFile) {
    return serviceFile.split('/')[1];
  }

  private generateComposeFiles(serviceRules: ServiceRule) {
    const serviceNames = Object.keys(serviceRules);
    const outputPaths = serviceNames.map(sn => this.generateComposeFile(sn, serviceRules[sn]));

    if (this.notifyComplete) {
      this.notifyComplete(this.outputDir, serviceNames, outputPaths);
    }
  }

  private generateComposeFile(serviceName: string, rule: MSPluginRule): string {
    const { template: tmplNm, options: getOptions } = rule;
    const template = this.templateMap[tmplNm];
    const { parsed } = template;
    const services = cloneDeep(parsed.services);
    const sName = Object.keys(services)[0];
    services[serviceName] = services[sName];
    delete parsed.services[sName];
    parsed.services[serviceName] = services[serviceName];
    const composeObj = getOptions ? getOptions(parsed) : parsed;
    const composeFile = `${serviceName}.yml`;
    const yamlContent = YAML.stringify(composeObj);
    const ouputPath = path.resolve(this.outputDir, composeFile);
    fs.writeFileSync(ouputPath, yamlContent.replace(/: null/g, ':'));
    return ouputPath;
  }
}
