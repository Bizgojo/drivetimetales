const fs=require('fs'),vm=require('vm'),ts=require(process.cwd()+'/node_modules/typescript'),React=require(process.cwd()+'/node_modules/react'),{act,create}=require(process.cwd()+'/node_modules/react-test-renderer'),assert=require('assert');
let callback,resolveInitial,resolveProfile;const initial=new Promise(r=>resolveInitial=r);
const auth={getSession:()=>initial,onAuthStateChange:cb=>(callback=cb,{data:{subscription:{unsubscribe(){}}}})};
const data={auth:{setSession:async()=>{},signOut:async()=>{}}};
const context={React,exports:{},require:n=>n==='react'?React:n.includes('supabase-browser')?{supabaseBrowser:{auth}}:n==='@/lib/supabase'?{supabase:data}:n.includes('readingProgress')?{mergeLocalReadingProgress:async()=>{}}:require(n),process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public'}},console,fetch:()=>new Promise(r=>resolveProfile=r)};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('contexts/AuthContext.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,context);
let state;function Probe(){state=context.exports.useAuth();return null}
test('auth restoration cannot overwrite newer signin or signout', async()=>{let root;await act(async()=>{root=create(React.createElement(context.exports.AuthProvider,null,React.createElement(Probe)))});
const user={id:'marc',email:'marc@example.com',user_metadata:{et_photo:'photo'}};
await act(async()=>{callback('SIGNED_IN',{user,access_token:'a',refresh_token:'r'})});
assert.equal(state.user.id,'marc');assert.equal(state.loading,false);
await act(async()=>resolveInitial({data:{session:null}}));assert.equal(state.user.id,'marc','late initial null cannot erase signin');
await act(async()=>callback('SIGNED_OUT',null));assert.equal(state.user,null);
await act(async()=>resolveProfile({ok:true,json:async()=>[{first_name:'Old profile'}]}));assert.equal(state.user,null,'late profile cannot restore signed-out identity');
await act(async()=>root.unmount());console.log('PASS: restored identity, stale initial session, stale profile after signout');});
