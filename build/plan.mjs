import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('gallery-data.json','utf8'));
// rotate (0,0,1) by quaternion to get facing normal
function fwd(q){
  const {x,y,z,w}=q; const vx=0,vy=0,vz=1;
  const ix= w*vx + y*vz - z*vy;
  const iy= w*vy + z*vx - x*vz;
  const iz= w*vz + x*vy - y*vx;
  const iw=-x*vx - y*vy - z*vz;
  return {
    x: ix*w + iw*-x + iy*-z - iz*-y,
    z: iz*w + iw*-z + ix*-y - iy*-x,
  };
}
const b=d.bounds, pad=4;
const minX=b.minX-pad,maxX=b.maxX+pad,minZ=b.minZ-pad,maxZ=b.maxZ+pad;
const W=900, scale=W/(maxX-minX), H=Math.round((maxZ-minZ)*scale);
const X=x=>(x-minX)*scale, Z=z=>(z-minZ)*scale;
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif">`;
s+=`<rect width="${W}" height="${H}" fill="#0f1117"/>`;
s+=`<rect x="${X(b.minX)}" y="${Z(b.minZ)}" width="${(b.maxX-b.minX)*scale}" height="${(b.maxZ-b.minZ)*scale}" fill="none" stroke="#2c2f3a" stroke-width="2"/>`;
// spawn
s+=`<circle cx="${X(d.spawn.x)}" cy="${Z(d.spawn.z)}" r="7" fill="#5fd3ff"/><text x="${X(d.spawn.x)+10}" y="${Z(d.spawn.z)+4}" fill="#5fd3ff" font-size="12">start</text>`;
for(const f of d.frames){
  const cx=X(f.position.x), cy=Z(f.position.z);
  const n=fwd(f.quaternion); const L=18;
  s+=`<line x1="${cx}" y1="${cy}" x2="${cx+n.x*L}" y2="${cy+n.z*L}" stroke="#ffd27f" stroke-width="2"/>`;
  s+=`<circle cx="${cx}" cy="${cy}" r="5" fill="#e9e7e2"/>`;
  s+=`<text x="${cx+5}" y="${cy-5}" fill="#9aa" font-size="10">${f.id}</text>`;
}
s+=`</svg>`;
fs.writeFileSync('gallery-plan.svg',s);
console.log('wrote gallery-plan.svg', W+'x'+H);
