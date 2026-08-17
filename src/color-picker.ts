import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const value = parseInt(hex.slice(1), 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

@customElement('mf-color-picker')
export class ColorPicker extends LitElement {
    @property({ type: String }) accessor startColor: string = '#ffffff';

    @state() accessor hex: string = '#ffffff';
    @state() accessor alpha: number = 1;

    static styles = css`
        :host {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 8px 0;
        }
        input[type="color"] {
            width: 100%;
            height: 32px;
            padding: 0;
            border: none;
            background: none;
        }
        input[type="range"] {
            width: 100%;
        }
    `;

    connectedCallback(): void {
        super.connectedCallback();
        this.hex = this.startColor;
    }

    private emitChange(): void {
        const { r, g, b } = hexToRgb(this.hex);
        this.dispatchEvent(new CustomEvent('colorChange', {
            detail: { r, g, b, a: this.alpha },
            bubbles: true,
            composed: true,
        }));
    }

    render() {
        return html`
            <input type="color" .value=${this.hex}
                @input=${(e: Event) => {
                    this.hex = (e.target as HTMLInputElement).value;
                    this.emitChange();
                }} />
            <input type="range" min="0" max="1" step="0.01" .value=${String(this.alpha)}
                @input=${(e: Event) => {
                    this.alpha = Number((e.target as HTMLInputElement).value);
                    this.emitChange();
                }} />
        `;
    }
}
