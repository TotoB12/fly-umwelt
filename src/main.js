import {LabApp} from './app.js';
const app=new LabApp();
app.init();
globalThis.__flyCnsLab=app;

if(new URLSearchParams(location.search).get('smoke')==='1') import('./smoke-probe.js');
