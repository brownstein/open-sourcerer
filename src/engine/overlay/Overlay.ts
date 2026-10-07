import shortid from "shortid";

import {
  OverlayAPI,
  OverlayComponentProps,
  OverlayProviderAPI,
  OverlaySpecAPI
} from "src/api/overlay";

export class Overlay<
  T extends unknown,
  PT extends OverlayComponentProps<T> = OverlayComponentProps<T>,
  ST extends OverlaySpecAPI<PT> = OverlaySpecAPI<PT>
> implements OverlayAPI<T, PT, ST>
{
  public id = shortid();
  public spec: ST;
  private provider: OverlayProviderAPI;
  constructor(spec: ST, provider: OverlayProviderAPI) {
    this.spec = spec;
    this.provider = provider;
  }
  remove() {
    this.provider.removeOverlay(this.id);
  }
}
