// MATH — seeded rng, value-noise, fbm, helpers, segment-crossing test.
// ---------- rng / noise ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function makeNoise(seed){
  const r=mulberry32(seed),G=256,g=new Float32Array(G*G);
  for(let i=0;i<g.length;i++)g[i]=r();
  const at=(x,y)=>g[((y%G+G)%G)*G+((x%G+G)%G)];
  return (x,y)=>{const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
    const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    const a=at(x0,y0),b=at(x0+1,y0),c=at(x0,y0+1),d=at(x0+1,y0+1);
    return (a*(1-sx)+b*sx)*(1-sy)+(c*(1-sx)+d*sx)*sy;};
}
function fbm(n,x,y,oct=5){let a=0,amp=0.5,f=1,norm=0;for(let o=0;o<oct;o++){a+=amp*n(x*f,y*f);norm+=amp;f*=2;amp*=0.5;}return a/norm;}
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const smooth=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0),0,1);return t*t*(3-2*t);};
// proper segment crossing (strict; shared endpoints / collinear touching don't count)
function segCross(a,b,c,d){const s=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const d1=s(c,d,a),d2=s(c,d,b),d3=s(a,b,c),d4=s(a,b,d);
  return ((d1>0)!==(d2>0))&&((d3>0)!==(d4>0));}
