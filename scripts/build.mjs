import {cp,rm,mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),dist=resolve(root,'dist');
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const file of ['index.html','favicon.svg','_headers','_redirects','README.md','BUILD_REPORT.md','CHANGELOG.md','REDESIGN_HANDOFF.md','ACCURACY_IMPLEMENTATION_REPORT.md','WHOLE_CNS_IMPLEMENTATION_REPORT.md','THIRD_PARTY_NOTICES.md'])await copyFile(resolve(root,file),resolve(dist,file));
for(const dir of ['src','docs'])await cp(resolve(root,dir),resolve(dist,dir),{recursive:true});
// Static public contents are deployed at the site root.
await cp(resolve(root,'public'),dist,{recursive:true,force:true});
console.log(`built ${dist}`);
