import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const code=ts.transpileModule(readFileSync('lib/dictation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {createDictation,speechError}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
let rec,states=[],messages=[],words=[],partials=[];
class FakeRecognition{constructor(){rec=this;}starts=0;start(){this.starts++;}stop(){}abort(){}}
const cb={state:s=>states.push(s),message:m=>messages.push(m),append:t=>words.push(t),interim:t=>partials.push(t)};
let c=createDictation(FakeRecognition,'hi-IN',cb);c.start();assert.equal(states.at(-1),'starting');rec.onstart();assert.equal(states.at(-1),'listening');assert.equal(rec.lang,'hi-IN');
const result=(text,isFinal)=>Object.assign([{transcript:text}],{isFinal});
rec.onresult({results:[result('नमस्ते',false)]});assert.equal(words.length,0);assert.equal(partials.at(-1),'नमस्ते');
rec.onresult({results:[result('नमस्ते',true)]});rec.onresult({results:[result('नमस्ते',true),result('दोस्त',true)]});assert.deepEqual(words,['नमस्ते','दोस्त']);
c.stop();rec.onend();assert.equal(states.at(-1),'idle');c.abort();
c=createDictation(FakeRecognition,'en-IN',cb);c.start();rec.onerror({error:'not-allowed'});rec.onend();assert.equal(states.at(-1),'error');assert.match(messages.at(-1),/blocked/);c.abort();
class Throws extends FakeRecognition{start(){throw Object.assign(new Error(),{name:'NotAllowedError'});}}
c=createDictation(Throws,'en-IN',cb);c.start();assert.equal(states.at(-1),'error');assert.match(messages.at(-1),/denied/);c.abort();
c=createDictation(FakeRecognition,'en-IN',cb);c.start();const late=rec.onresult;c.abort();late({results:[result('late words',true)]});assert.deepEqual(words,['नमस्ते','दोस्त']);assert.equal(rec.onresult,null);
assert.match(speechError('network'),/connection/);assert.match(speechError('audio-capture'),/microphone/);assert.match(speechError('language-not-supported'),/language/);
console.log('Dictation checks passed: startup/listening, interim vs final, no duplicate text, stop, denied permission, thrown startup, cleanup/late results and actionable errors. Speech engine mocked; physical mic not tested.');

const wait=()=>new Promise(resolve=>setTimeout(resolve,400));
c=createDictation(FakeRecognition,'hi-IN',cb);c.start();rec.onstart();
rec.onresult({results:[result('पहला',true)]});rec.onend();assert.equal(states.at(-1),'starting');await wait();assert.equal(rec.starts,2);rec.onstart();
rec.onresult({results:[result('दूसरा',true)]});assert.deepEqual(words.slice(-2),['पहला','दूसरा']);
rec.onerror({error:'no-speech'});rec.onend();await wait();assert.equal(rec.starts,3);rec.onstart();
rec.onend();c.stop();await wait();assert.equal(rec.starts,3);rec.onend();assert.equal(states.at(-1),'idle');c.abort();
c=createDictation(FakeRecognition,'hi-IN',cb);c.start();rec.onstart();rec.onend();c.abort();await wait();assert.equal(rec.starts,1);
c=createDictation(FakeRecognition,'hi-IN',cb);c.start();for(let i=0;i<5;i++){rec.onstart();rec.onend();if(i<4)await wait();}assert.equal(states.at(-1),'error');assert.equal(rec.starts,5);c.abort();
console.log('Auto-reconnect checks passed: session end, silence, new session result indices, explicit stop during reconnect, cleanup and bounded rapid failures.');
