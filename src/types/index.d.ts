declare module 'webpack-moleculer-service-plugin' {
  export interface Template {
    name: string; // template name
    template?: string; // template string. Instead of using template path, can use `.yml`
    path?: string; // path to template file .yml
    parsed?: any;
  }

  export interface Service {
    image: string;
    command: string | string[];
    ports?: string[];
    networks?: string[];
    depends_on?: string[];
    deploy?: any;
  }

  export interface ComposeFile {
    version: string;
    services: Service[];
    networks: any;
    configs: any;
    volumes: any;
  }

  export interface MSPluginRule {
    template: string;
    options?: (options: ComposeFile) => ComposeFile
  }

  export interface MSPluginRuleConfigs {
    [key: string]: MSPluginRule; // key can be service name or regex
  }

  export interface MSPluginOptions {
    output: string;
    templates?: Template[];
    templateDir?: string;
    encoding?: string;
    mask?: string | RegExp;
    rules?: MSPluginRuleConfigs;
    complete?: (outputDir: string, services: string[], servicePaths: string[]) => void;
  }
}
