import { html,render } from "./lit-html.js";
class Hello extends HTMLElement { 
    connectedCallback() { 
        const template = html`
        <button @click="${_ => this.loadMap()}">load from server</button>
            <h2>hello</h2>
        `
        render(template, this);
        
    }
    
    async loadMap() { 
        await import('Hello.js')
        const response = await fetch("import-map.json");
        const json = await response.json();
        const { imports: { redux } } = json;
        console.log(`Where is redux: ${redux}`);
    }

}
customElements.define("j-hello",Hello);


