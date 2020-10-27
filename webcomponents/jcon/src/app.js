import './Hello.js';
import './Jcon.js';


import { Router } from './@vaadin/router.js';

const outlet = document.querySelector('output');
const router = new Router(outlet);
router.setRoutes([
  {path: '/',     component: 'j-con'},
  {path: '/hello',  component: 'j-hello'}
]);