import {LabApp} from './app.js';
const app=new LabApp();
app.init();
globalThis.__flyCnsLab=app;

const query=new URLSearchParams(location.search);
if(query.get('smoke')==='1') import('./smoke-probe.js');
else if(query.get('fullprobe')==='1') import('./full-pack-probe.js');
