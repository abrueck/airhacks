import "./@ui5/webcomponents/dist/DatePicker.js";
import { html, render } from "./lit-html.js";
import "./@vaadin/vaadin-date-picker.js";


class JCon extends HTMLElement { 
    connectedCallback() { 
        const template = html`
        <vaadin-date-picker @change="${e => this.onVaadinJcon(e)}" label="New JCON"></vaadin-date-picker>
        <ui5-date-picker @change="${e => this.onNewJcon(e)}" id="myDatepicker1"></ui5-date-picker>
            <h2>jcon</h2>
        `;
        render(template,this);
        
    }

    onVaadinJcon({ target: { value } }) { 
        console.log(value);
    }

    onNewJcon({ detail: { value } }) { 
        console.log(value);
    }
    
}
customElements.define("j-con",JCon);


