import{o as Ne,t as ye}from"../chunks/index.b0aa1c80.js";import{S as Me,a as ze,I as q,g as Ce,f as qe,b as we,c as le,s as H,i as _e,d as Z,e as z,P as Fe,h as We}from"../chunks/singletons.9a27e7c3.js";import{u as Ye}from"../chunks/parse.d12b0d5b.js";function Xe(n,o){return n==="/"||o==="ignore"?n:o==="never"?n.endsWith("/")?n.slice(0,-1):n:o==="always"&&!n.endsWith("/")?n+"/":n}function Qe(n){return n.split("%25").map(decodeURI).join("%25")}function Ze(n){for(const o in n)n[o]=decodeURIComponent(n[o]);return n}const et=["href","pathname","search","searchParams","toString","toJSON"];function tt(n,o){const c=new URL(n);for(const l of et){let p=c[l];Object.defineProperty(c,l,{get(){return o(),p},enumerable:!0,configurable:!0})}return nt(c),c}function nt(n){Object.defineProperty(n,"hash",{get(){throw new Error("Cannot access event.url.hash. Consider using `$page.url.hash` inside a component instead")}})}const at="/__data.json";function rt(n){return n.replace(/\/$/,"")+at}function Ve(n){try{return JSON.parse(sessionStorage[n])}catch{}}function He(n,o){const c=JSON.stringify(o);try{sessionStorage[n]=c}catch{}}function ot(...n){let o=5381;for(const c of n)if(typeof c=="string"){let l=c.length;for(;l;)o=o*33^c.charCodeAt(--l)}else if(ArrayBuffer.isView(c)){const l=new Uint8Array(c.buffer,c.byteOffset,c.byteLength);let p=l.length;for(;p;)o=o*33^l[--p]}else throw new TypeError("value must be a string or TypedArray");return(o>>>0).toString(36)}const fe=window.fetch;window.fetch=(n,o)=>((n instanceof Request?n.method:(o==null?void 0:o.method)||"GET")!=="GET"&&te.delete(Se(n)),fe(n,o));const te=new Map;function it(n,o){const c=Se(n,o),l=document.querySelector(c);if(l!=null&&l.textContent){const{body:p,...E}=JSON.parse(l.textContent),x=l.getAttribute("data-ttl");return x&&te.set(c,{body:p,init:E,ttl:1e3*Number(x)}),Promise.resolve(new Response(p,E))}return fe(n,o)}function st(n,o,c){if(te.size>0){const l=Se(n,c),p=te.get(l);if(p){if(performance.now()<p.ttl&&["default","force-cache","only-if-cached",void 0].includes(c==null?void 0:c.cache))return new Response(p.body,p.init);te.delete(l)}}return fe(o,c)}function Se(n,o){let l=`script[data-sveltekit-fetched][data-url=${JSON.stringify(n instanceof Request?n.url:n)}]`;if(o!=null&&o.headers||o!=null&&o.body){const p=[];o.headers&&p.push([...new Headers(o.headers)].join(",")),o.body&&(typeof o.body=="string"||ArrayBuffer.isView(o.body))&&p.push(o.body),l+=`[data-hash="${ot(...p)}"]`}return l}const ct=/^(\[)?(\.\.\.)?(\w+)(?:=(\w+))?(\])?$/;function lt(n){const o=[];return{pattern:n==="/"?/^\/$/:new RegExp(`^${ut(n).map(l=>{const p=/^\[\.\.\.(\w+)(?:=(\w+))?\]$/.exec(l);if(p)return o.push({name:p[1],matcher:p[2],optional:!1,rest:!0,chained:!0}),"(?:/(.*))?";const E=/^\[\[(\w+)(?:=(\w+))?\]\]$/.exec(l);if(E)return o.push({name:E[1],matcher:E[2],optional:!0,rest:!1,chained:!0}),"(?:/([^/]+))?";if(!l)return;const x=l.split(/\[(.+?)\](?!\])/);return"/"+x.map((v,b)=>{if(b%2){if(v.startsWith("x+"))return ve(String.fromCharCode(parseInt(v.slice(2),16)));if(v.startsWith("u+"))return ve(String.fromCharCode(...v.slice(2).split("-").map(U=>parseInt(U,16))));const m=ct.exec(v);if(!m)throw new Error(`Invalid param: ${v}. Params and matcher names can only have underscores and alphanumeric characters.`);const[,C,T,I,A]=m;return o.push({name:I,matcher:A,optional:!!C,rest:!!T,chained:T?b===1&&x[0]==="":!1}),T?"(.*?)":C?"([^/]*)?":"([^/]+?)"}return ve(v)}).join("")}).join("")}/?$`),params:o}}function ft(n){return!/^\([^)]+\)$/.test(n)}function ut(n){return n.slice(1).split("/").filter(ft)}function dt(n,o,c){const l={},p=n.slice(1);let E=0;for(let x=0;x<o.length;x+=1){const _=o[x],v=p[x-E];if(_.chained&&_.rest&&E){l[_.name]=p.slice(x-E,x+1).filter(b=>b).join("/"),E=0;continue}if(v===void 0){_.rest&&(l[_.name]="");continue}if(!_.matcher||c[_.matcher](v)){l[_.name]=v;const b=o[x+1],m=p[x+1];b&&!b.rest&&b.optional&&m&&(E=0);continue}if(_.optional&&_.chained){E++;continue}return}if(!E)return l}function ve(n){return n.normalize().replace(/[[\]]/g,"\\$&").replace(/%/g,"%25").replace(/\//g,"%2[Ff]").replace(/\?/g,"%3[Ff]").replace(/#/g,"%23").replace(/[.*+?^${}()|\\]/g,"\\$&")}function pt({nodes:n,server_loads:o,dictionary:c,matchers:l}){const p=new Set(o);return Object.entries(c).map(([_,[v,b,m]])=>{const{pattern:C,params:T}=lt(_),I={id:_,exec:A=>{const U=C.exec(A);if(U)return dt(U,T,l)},errors:[1,...m||[]].map(A=>n[A]),layouts:[0,...b||[]].map(x),leaf:E(v)};return I.errors.length=I.layouts.length=Math.max(I.errors.length,I.layouts.length),I});function E(_){const v=_<0;return v&&(_=~_),[v,n[_]]}function x(_){return _===void 0?_:[p.has(_),n[_]]}}let ee=class{constructor(o,c){this.status=o,typeof c=="string"?this.body={message:c}:c?this.body=c:this.body={message:`Error: ${o}`}}toString(){return JSON.stringify(this.body)}},Je=class{constructor(o,c){this.status=o,this.location=c}};async function ht(n){var o;for(const c in n)if(typeof((o=n[c])==null?void 0:o.then)=="function")return Object.fromEntries(await Promise.all(Object.entries(n).map(async([l,p])=>[l,await p])));return n}function mt(n){return n.filter(o=>o!=null)}const V=Ve(Me)??{},Q=Ve(ze)??{};function be(n){V[n]=Z()}function gt(n,o){var je;const c=pt(n),l=n.nodes[0],p=n.nodes[1];l(),p();const E=document.documentElement,x=[],_=[];let v=null;const b={before_navigate:[],after_navigate:[]};let m={branch:[],error:null,url:null},C=!1,T=!1,I=!0,A=!1,U=!1,B=!1,J=!1,F,$=(je=history.state)==null?void 0:je[q];$||($=Date.now(),history.replaceState({...history.state,[q]:$},"",location.href));const ue=V[$];ue&&(history.scrollRestoration="manual",scrollTo(ue.x,ue.y));let K,ne,ae;async function ke(){ae=ae||Promise.resolve(),await ae,ae=null;const e=new URL(location.href),t=Y(e,!0);v=null;const r=ne={},a=t&&await he(t);if(r===ne&&a){if(a.type==="redirect")return re(new URL(a.location,e).href,{},[e.pathname],r);F.$set(a.props)}}function xe(e){_.some(t=>t==null?void 0:t.snapshot)&&(Q[e]=_.map(t=>{var r;return(r=t==null?void 0:t.snapshot)==null?void 0:r.capture()}))}function Re(e){var t;(t=Q[e])==null||t.forEach((r,a)=>{var s,i;(i=(s=_[a])==null?void 0:s.snapshot)==null||i.restore(r)})}function Le(){be($),He(Me,V),xe($),He(ze,Q)}async function re(e,{noScroll:t=!1,replaceState:r=!1,keepFocus:a=!1,state:s={},invalidateAll:i=!1},f,u){return typeof e=="string"&&(e=new URL(e,Ce(document))),ce({url:e,scroll:t?Z():null,keepfocus:a,redirect_chain:f,details:{state:s,replaceState:r},nav_token:u,accepted:()=>{i&&(J=!0)},blocked:()=>{},type:"goto"})}async function Pe(e){return v={id:e.id,promise:he(e).then(t=>(t.type==="loaded"&&t.state.error&&(v=null),t))},v.promise}async function oe(...e){const r=c.filter(a=>e.some(s=>a.exec(s))).map(a=>Promise.all([...a.layouts,a.leaf].map(s=>s==null?void 0:s[1]())));await Promise.all(r)}function Ue(e){var a;m=e.state;const t=document.querySelector("style[data-sveltekit]");t&&t.remove(),K=e.props.page,F=new n.root({target:o,props:{...e.props,stores:H,components:_},hydrate:!0}),Re($);const r={from:null,to:{params:m.params,route:{id:((a=m.route)==null?void 0:a.id)??null},url:new URL(location.href)},willUnload:!1,type:"enter"};b.after_navigate.forEach(s=>s(r)),T=!0}async function W({url:e,params:t,branch:r,status:a,error:s,route:i,form:f}){let u="never";for(const g of r)(g==null?void 0:g.slash)!==void 0&&(u=g.slash);e.pathname=Xe(e.pathname,u),e.search=e.search;const y={type:"loaded",state:{url:e,params:t,branch:r,error:s,route:i},props:{constructors:mt(r).map(g=>g.node.component)}};f!==void 0&&(y.props.form=f);let d={},S=!K,L=0;for(let g=0;g<Math.max(r.length,m.branch.length);g+=1){const h=r[g],O=m.branch[g];(h==null?void 0:h.data)!==(O==null?void 0:O.data)&&(S=!0),h&&(d={...d,...h.data},S&&(y.props[`data_${L}`]=d),L+=1)}return(!m.url||e.href!==m.url.href||m.error!==s||f!==void 0&&f!==K.form||S)&&(y.props.page={error:s,params:t,route:{id:(i==null?void 0:i.id)??null},status:a,url:new URL(e),form:f??null,data:S?d:K.data}),y}async function de({loader:e,parent:t,url:r,params:a,route:s,server_data_node:i}){var d,S,L;let f=null;const u={dependencies:new Set,params:new Set,parent:!1,route:!1,url:!1},y=await e();if((d=y.universal)!=null&&d.load){let P=function(...h){for(const O of h){const{href:D}=new URL(O,r);u.dependencies.add(D)}};const g={route:{get id(){return u.route=!0,s.id}},params:new Proxy(a,{get:(h,O)=>(u.params.add(O),h[O])}),data:(i==null?void 0:i.data)??null,url:tt(r,()=>{u.url=!0}),async fetch(h,O){let D;h instanceof Request?(D=h.url,O={body:h.method==="GET"||h.method==="HEAD"?void 0:await h.blob(),cache:h.cache,credentials:h.credentials,headers:h.headers,integrity:h.integrity,keepalive:h.keepalive,method:h.method,mode:h.mode,redirect:h.redirect,referrer:h.referrer,referrerPolicy:h.referrerPolicy,signal:h.signal,...O}):D=h;const N=new URL(D,r);return P(N.href),N.origin===r.origin&&(D=N.href.slice(r.origin.length)),T?st(D,N.href,O):it(D,O)},setHeaders:()=>{},depends:P,parent(){return u.parent=!0,t()}};f=await y.universal.load.call(null,g)??null,f=f?await ht(f):null}return{node:y,loader:e,server:i,universal:(S=y.universal)!=null&&S.load?{type:"data",data:f,uses:u}:null,data:f??(i==null?void 0:i.data)??null,slash:((L=y.universal)==null?void 0:L.trailingSlash)??(i==null?void 0:i.slash)}}function Ae(e,t,r,a,s){if(J)return!0;if(!a)return!1;if(a.parent&&e||a.route&&t||a.url&&r)return!0;for(const i of a.params)if(s[i]!==m.params[i])return!0;for(const i of a.dependencies)if(x.some(f=>f(new URL(i))))return!0;return!1}function pe(e,t){return(e==null?void 0:e.type)==="data"?e:(e==null?void 0:e.type)==="skip"?t??null:null}async function he({id:e,invalidating:t,url:r,params:a,route:s}){if((v==null?void 0:v.id)===e)return v.promise;const{errors:i,layouts:f,leaf:u}=s,y=[...f,u];i.forEach(w=>w==null?void 0:w().catch(()=>{})),y.forEach(w=>w==null?void 0:w[1]().catch(()=>{}));let d=null;const S=m.url?e!==m.url.pathname+m.url.search:!1,L=m.route?s.id!==m.route.id:!1;let P=!1;const g=y.map((w,R)=>{var M;const k=m.branch[R],j=!!(w!=null&&w[0])&&((k==null?void 0:k.loader)!==w[1]||Ae(P,L,S,(M=k.server)==null?void 0:M.uses,a));return j&&(P=!0),j});if(g.some(Boolean)){try{d=await Ke(r,g)}catch(w){return ie({status:w instanceof ee?w.status:500,error:await X(w,{url:r,params:a,route:{id:s.id}}),url:r,route:s})}if(d.type==="redirect")return d}const h=d==null?void 0:d.nodes;let O=!1;const D=y.map(async(w,R)=>{var me;if(!w)return;const k=m.branch[R],j=h==null?void 0:h[R];if((!j||j.type==="skip")&&w[1]===(k==null?void 0:k.loader)&&!Ae(O,L,S,(me=k.universal)==null?void 0:me.uses,a))return k;if(O=!0,(j==null?void 0:j.type)==="error")throw j;return de({loader:w[1],url:r,params:a,route:s,parent:async()=>{var De;const Te={};for(let ge=0;ge<R;ge+=1)Object.assign(Te,(De=await D[ge])==null?void 0:De.data);return Te},server_data_node:pe(j===void 0&&w[0]?{type:"skip"}:j??null,w[0]?k==null?void 0:k.server:void 0)})});for(const w of D)w.catch(()=>{});const N=[];for(let w=0;w<y.length;w+=1)if(y[w])try{N.push(await D[w])}catch(R){if(R instanceof Je)return{type:"redirect",location:R.location};let k=500,j;if(h!=null&&h.includes(R))k=R.status??k,j=R.error;else if(R instanceof ee)k=R.status,j=R.body;else{if(await H.updated.check())return await G(r);j=await X(R,{params:a,url:r,route:{id:s.id}})}const M=await $e(w,N,i);return M?await W({url:r,params:a,branch:N.slice(0,M.idx).concat(M.node),status:k,error:j,route:s}):await Ie(r,{id:s.id},j,k)}else N.push(void 0);return await W({url:r,params:a,branch:N,status:200,error:null,route:s,form:t?void 0:null})}async function $e(e,t,r){for(;e--;)if(r[e]){let a=e;for(;!t[a];)a-=1;try{return{idx:a+1,node:{node:await r[e](),loader:r[e],data:{},server:null,universal:null}}}catch{continue}}}async function ie({status:e,error:t,url:r,route:a}){const s={};let i=null;if(n.server_loads[0]===0)try{const d=await Ke(r,[!0]);if(d.type!=="data"||d.nodes[0]&&d.nodes[0].type!=="data")throw 0;i=d.nodes[0]??null}catch{(r.origin!==location.origin||r.pathname!==location.pathname||C)&&await G(r)}const u=await de({loader:l,url:r,params:s,route:a,parent:()=>Promise.resolve({}),server_data_node:pe(i)}),y={node:await p(),loader:p,universal:null,server:null,data:null};return await W({url:r,params:s,branch:[u,y],status:e,error:t,route:null})}function Y(e,t){if(_e(e,z))return;const r=se(e);for(const a of c){const s=a.exec(r);if(s)return{id:e.pathname+e.search,invalidating:t,route:a,params:Ze(s),url:e}}}function se(e){return Qe(e.pathname.slice(z.length)||"/")}function Oe({url:e,type:t,intent:r,delta:a}){var u,y;let s=!1;const i={from:{params:m.params,route:{id:((u=m.route)==null?void 0:u.id)??null},url:m.url},to:{params:(r==null?void 0:r.params)??null,route:{id:((y=r==null?void 0:r.route)==null?void 0:y.id)??null},url:e},willUnload:!r,type:t};a!==void 0&&(i.delta=a);const f={...i,cancel:()=>{s=!0}};return U||b.before_navigate.forEach(d=>d(f)),s?null:i}async function ce({url:e,scroll:t,keepfocus:r,redirect_chain:a,details:s,type:i,delta:f,nav_token:u={},accepted:y,blocked:d}){var D,N,w;const S=Y(e,!1),L=Oe({url:e,type:i,delta:f,intent:S});if(!L){d();return}const P=$;y(),U=!0,T&&H.navigating.set(L),ne=u;let g=S&&await he(S);if(!g){if(_e(e,z))return await G(e);g=await Ie(e,{id:null},await X(new Error(`Not found: ${e.pathname}`),{url:e,params:{},route:{id:null}}),404)}if(e=(S==null?void 0:S.url)||e,ne!==u)return!1;if(g.type==="redirect")if(a.length>10||a.includes(e.pathname))g=await ie({status:500,error:await X(new Error("Redirect loop"),{url:e,params:{},route:{id:null}}),url:e,route:{id:null}});else return re(new URL(g.location,e).href,{},[...a,e.pathname],u),!1;else((D=g.props.page)==null?void 0:D.status)>=400&&await H.updated.check()&&await G(e);if(x.length=0,J=!1,A=!0,be(P),xe(P),(N=g.props.page)!=null&&N.url&&g.props.page.url.pathname!==e.pathname&&(e.pathname=(w=g.props.page)==null?void 0:w.url.pathname),s){const R=s.replaceState?0:1;if(s.state[q]=$+=R,history[s.replaceState?"replaceState":"pushState"](s.state,"",e),!s.replaceState){let k=$+1;for(;Q[k]||V[k];)delete Q[k],delete V[k],k+=1}}v=null,T?(m=g.state,g.props.page&&(g.props.page.url=e),F.$set(g.props)):Ue(g);const{activeElement:h}=document;if(await ye(),I){const R=e.hash&&document.getElementById(decodeURIComponent(e.hash.slice(1)));t?scrollTo(t.x,t.y):R?R.scrollIntoView():scrollTo(0,0)}const O=document.activeElement!==h&&document.activeElement!==document.body;!r&&!O&&await Ee(),I=!0,g.props.page&&(K=g.props.page),U=!1,b.after_navigate.forEach(R=>R(L)),H.navigating.set(null),A=!1}async function Ie(e,t,r,a){return e.origin===location.origin&&e.pathname===location.pathname&&!C?await ie({status:a,error:r,url:e,route:t}):await G(e)}function G(e){return location.href=e.href,new Promise(()=>{})}function Ge(){let e;E.addEventListener("mousemove",i=>{const f=i.target;clearTimeout(e),e=setTimeout(()=>{a(f,2)},20)});function t(i){a(i.composedPath()[0],1)}E.addEventListener("mousedown",t),E.addEventListener("touchstart",t,{passive:!0});const r=new IntersectionObserver(i=>{for(const f of i)f.isIntersecting&&(oe(se(new URL(f.target.href))),r.unobserve(f.target))},{threshold:0});function a(i,f){const u=qe(i,E);if(!u)return;const{url:y,external:d,download:S}=we(u,z);if(d||S)return;const L=le(u);if(!L.reload)if(f<=L.preload_data){const P=Y(y,!1);P&&Pe(P)}else f<=L.preload_code&&oe(se(y))}function s(){r.disconnect();for(const i of E.querySelectorAll("a")){const{url:f,external:u,download:y}=we(i,z);if(u||y)continue;const d=le(i);d.reload||(d.preload_code===Fe.viewport&&r.observe(i),d.preload_code===Fe.eager&&oe(se(f)))}}b.after_navigate.push(s),s()}function X(e,t){return e instanceof ee?e.body:n.hooks.handleError({error:e,event:t})??{message:t.route.id!=null?"Internal Error":"Not Found"}}return{after_navigate:e=>{Ne(()=>(b.after_navigate.push(e),()=>{const t=b.after_navigate.indexOf(e);b.after_navigate.splice(t,1)}))},before_navigate:e=>{Ne(()=>(b.before_navigate.push(e),()=>{const t=b.before_navigate.indexOf(e);b.before_navigate.splice(t,1)}))},disable_scroll_handling:()=>{(A||!T)&&(I=!1)},goto:(e,t={})=>re(e,t,[]),invalidate:e=>{if(typeof e=="function")x.push(e);else{const{href:t}=new URL(e,location.href);x.push(r=>r.href===t)}return ke()},invalidateAll:()=>(J=!0,ke()),preload_data:async e=>{const t=new URL(e,Ce(document)),r=Y(t,!1);if(!r)throw new Error(`Attempted to preload a URL that does not belong to this app: ${t}`);await Pe(r)},preload_code:oe,apply_action:async e=>{if(e.type==="error"){const t=new URL(location.href),{branch:r,route:a}=m;if(!a)return;const s=await $e(m.branch.length,r,a.errors);if(s){const i=await W({url:t,params:m.params,branch:r.slice(0,s.idx).concat(s.node),status:e.status??500,error:e.error,route:a});m=i.state,F.$set(i.props),ye().then(Ee)}}else e.type==="redirect"?re(e.location,{invalidateAll:!0},[]):(F.$set({form:null,page:{...K,form:e.data,status:e.status}}),await ye(),F.$set({form:e.data}),e.type==="success"&&Ee())},_start_router:()=>{var e;history.scrollRestoration="manual",addEventListener("beforeunload",t=>{var a;let r=!1;if(Le(),!U){const s={from:{params:m.params,route:{id:((a=m.route)==null?void 0:a.id)??null},url:m.url},to:null,willUnload:!0,type:"leave",cancel:()=>r=!0};b.before_navigate.forEach(i=>i(s))}r?(t.preventDefault(),t.returnValue=""):history.scrollRestoration="auto"}),addEventListener("visibilitychange",()=>{document.visibilityState==="hidden"&&Le()}),(e=navigator.connection)!=null&&e.saveData||Ge(),E.addEventListener("click",t=>{if(t.button||t.which!==1||t.metaKey||t.ctrlKey||t.shiftKey||t.altKey||t.defaultPrevented)return;const r=qe(t.composedPath()[0],E);if(!r)return;const{url:a,external:s,target:i,download:f}=we(r,z);if(!a)return;if(i==="_parent"||i==="_top"){if(window.parent!==window)return}else if(i&&i!=="_self")return;const u=le(r);if(!(r instanceof SVGAElement)&&a.protocol!==location.protocol&&!(a.protocol==="https:"||a.protocol==="http:")||f)return;if(s||u.reload){Oe({url:a,type:"link"})?U=!0:t.preventDefault();return}const[d,S]=a.href.split("#");if(S!==void 0&&d===location.href.split("#")[0]){if(B=!0,be($),m.url=a,H.page.set({...K,url:a}),H.page.notify(),!u.replace_state)return;B=!1,t.preventDefault()}ce({url:a,scroll:u.noscroll?Z():null,keepfocus:u.keep_focus??!1,redirect_chain:[],details:{state:{},replaceState:u.replace_state??a.href===location.href},accepted:()=>t.preventDefault(),blocked:()=>t.preventDefault(),type:"link"})}),E.addEventListener("submit",t=>{if(t.defaultPrevented)return;const r=HTMLFormElement.prototype.cloneNode.call(t.target),a=t.submitter;if(((a==null?void 0:a.formMethod)||r.method)!=="get")return;const i=new URL((a==null?void 0:a.hasAttribute("formaction"))&&(a==null?void 0:a.formAction)||r.action);if(_e(i,z))return;const f=t.target,{keep_focus:u,noscroll:y,reload:d,replace_state:S}=le(f);if(d)return;t.preventDefault(),t.stopPropagation();const L=new FormData(f),P=a==null?void 0:a.getAttribute("name");P&&L.append(P,(a==null?void 0:a.getAttribute("value"))??""),i.search=new URLSearchParams(L).toString(),ce({url:i,scroll:y?Z():null,keepfocus:u??!1,redirect_chain:[],details:{state:{},replaceState:S??i.href===location.href},nav_token:{},accepted:()=>{},blocked:()=>{},type:"form"})}),addEventListener("popstate",async t=>{var r;if((r=t.state)!=null&&r[q]){if(t.state[q]===$)return;const a=V[t.state[q]];if(m.url.href.split("#")[0]===location.href.split("#")[0]){V[$]=Z(),$=t.state[q],scrollTo(a.x,a.y);return}const s=t.state[q]-$;let i=!1;await ce({url:new URL(location.href),scroll:a,keepfocus:!1,redirect_chain:[],details:null,accepted:()=>{$=t.state[q]},blocked:()=>{history.go(-s),i=!0},type:"popstate",delta:s}),i||Re($)}}),addEventListener("hashchange",()=>{B&&(B=!1,history.replaceState({...history.state,[q]:++$},"",location.href))});for(const t of document.querySelectorAll("link"))t.rel==="icon"&&(t.href=t.href);addEventListener("pageshow",t=>{t.persisted&&H.navigating.set(null)})},_hydrate:async({status:e=200,error:t,node_ids:r,params:a,route:s,data:i,form:f})=>{C=!0;const u=new URL(location.href);({params:a={},route:s={id:null}}=Y(u,!1)||{});let y;try{const d=r.map(async(S,L)=>{const P=i[L];return P!=null&&P.uses&&(P.uses=Be(P.uses)),de({loader:n.nodes[S],url:u,params:a,route:s,parent:async()=>{const g={};for(let h=0;h<L;h+=1)Object.assign(g,(await d[h]).data);return g},server_data_node:pe(P)})});y=await W({url:u,params:a,branch:await Promise.all(d),status:e,error:t,form:f,route:c.find(({id:S})=>S===s.id)??null})}catch(d){if(d instanceof Je){await G(new URL(d.location,location.href));return}y=await ie({status:d instanceof ee?d.status:500,error:await X(d,{url:u,params:a,route:s}),url:u,route:s})}Ue(y)}}}async function Ke(n,o){const c=new URL(n);c.pathname=rt(n.pathname),c.searchParams.append("x-sveltekit-invalidated",o.map(p=>p?"1":"").join("_"));const l=await fe(c.href);if(!l.ok)throw new ee(l.status,await l.json());return new Promise(async p=>{var m;const E=new Map,x=l.body.getReader(),_=new TextDecoder;function v(C){return Ye(C,{Promise:T=>new Promise((I,A)=>{E.set(T,{fulfil:I,reject:A})})})}let b="";for(;;){const{done:C,value:T}=await x.read();if(C&&!b)break;for(b+=!T&&b?`
`:_.decode(T);;){const I=b.indexOf(`
`);if(I===-1)break;const A=JSON.parse(b.slice(0,I));if(b=b.slice(I+1),A.type==="redirect")return p(A);if(A.type==="data")(m=A.nodes)==null||m.forEach(U=>{(U==null?void 0:U.type)==="data"&&(U.uses=Be(U.uses),U.data=v(U.data))}),p(A);else if(A.type==="chunk"){const{id:U,data:B,error:J}=A,F=E.get(U);E.delete(U),J?F.reject(v(J)):F.fulfil(v(B))}}}})}function Be(n){return{dependencies:new Set((n==null?void 0:n.dependencies)??[]),params:new Set((n==null?void 0:n.params)??[]),parent:!!(n!=null&&n.parent),route:!!(n!=null&&n.route),url:!!(n!=null&&n.url)}}function Ee(){const n=document.querySelector("[autofocus]");if(n)n.focus();else{const o=document.body,c=o.getAttribute("tabindex");return o.tabIndex=-1,o.focus({preventScroll:!0}),c!==null?o.setAttribute("tabindex",c):o.removeAttribute("tabindex"),new Promise(l=>{setTimeout(()=>{var p;l((p=getSelection())==null?void 0:p.removeAllRanges())})})}}async function Et(n,o,c){const l=gt(n,o);We({client:l}),c?await l._hydrate(c):l.goto(location.href,{replaceState:!0}),l._start_router()}export{Et as start};