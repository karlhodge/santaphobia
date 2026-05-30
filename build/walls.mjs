import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('gallery-data.json','utf8'));
function fwd(q){const{x,y,z,w}=q;const ix=w*0+y*1-z*0,iy=w*0+z*0-x*1,iz=w*1+x*0-y*0,iw=-x*0-y*0-z*1;
  return{x:ix*w+iw*-x+iy*-z-iz*-y,z:iz*w+iw*-z+ix*-y-iy*-x};}
const ax=v=>{const n=Math.hypot(v.x,v.z);const x=v.x/n,z=v.z/n;
  return Math.abs(x)>Math.abs(z)?(x>0?'+X':'-X'):(z>0?'+Z':'-Z');};
// group frames into walls: same facing axis + same constant coordinate (bucketed)
const groups={};
for(const f of d.frames){
  const a=ax(fwd(f.quaternion));
  const along = (a==='+X'||a==='-X') ? 'Z' : 'X';   // wall runs along this axis
  const constv = along==='Z' ? f.position.x : f.position.z; // constant coord
  const key = a+'@'+(Math.round(constv*2)/2);
  (groups[key]=groups[key]||{face:a,along,constv,frames:[]}).frames.push(f);
}
const walls=Object.values(groups).map(g=>{
  const t = g.frames.map(f=> g.along==='Z'? f.position.z : f.position.x);
  return {face:g.face, along:g.along, at:+g.constv.toFixed(2),
    min:+Math.min(...t).toFixed(2), max:+Math.max(...t).toFixed(2), n:g.frames.length,
    ids:g.frames.map(f=>f.id)};
}).sort((a,b)=> a.along.localeCompare(b.along)||a.at-b.at);
console.log('inferred wall faces:', walls.length);
for(const w of walls) console.log(`${w.face}  runs along ${w.along} at ${w.at}\trange ${w.min}..${w.max}\t(${w.n} frames: ${w.ids.join(',')})`);
