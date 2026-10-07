export type LayerProviderAPI = {
  includes(layerName: string): boolean;
};

export type LayersProps = {
  include?: string[];
  exclude?: string[];
  defaultInclude?: boolean;
};

/**
 * Layer name inclusion provider to allow levels to filter their layers.
 */
export class Layers implements LayerProviderAPI {
  include = new Set<string>();
  exclude = new Set<string>();
  defaultInclude?: boolean;
  constructor(props?: LayersProps) {
    if (props !== undefined) {
      if (props.include !== undefined) {
        this.include = new Set(props.include);
      }
      if (props.exclude !== undefined) {
        this.exclude = new Set(props.exclude);
      }
      if (props.defaultInclude !== undefined) {
        this.defaultInclude = props.defaultInclude;
      }
    }
  }
  includes(layerName: string) {
    if (this.include.has(layerName)) return true;
    if (this.exclude.has(layerName)) return false;
    if (this.defaultInclude) return true;
    return false;
  }
}
