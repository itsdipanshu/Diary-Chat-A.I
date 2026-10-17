export type VoiceState='idle'|'starting'|'listening'|'stopping'|'error';
export const speechError=(code:string)=>({
 'not-allowed':'Microphone access was blocked. Open this app in a separate browser tab, allow Microphone in site permissions, then try again.',
 'service-not-allowed':'Your browser blocked its speech recognition service. Open the app directly in a supported browser and check microphone permissions.',
 'audio-capture':'No usable microphone was found. Check that a microphone is connected, enabled, and available to your browser.',
 'network':'The browser could not reach its speech recognition service. Check your connection and try again. An AI API key does not fix this browser-service error.',
 'repeated-disconnect':'Your browser keeps disconnecting voice typing. Try again in a separate browser tab with the app visible.',
 'no-speech':'No speech was detected. Check your microphone, move closer and try again.',
 'language-not-supported':'This speech service does not support the selected language. Try another language/locale.',
 'InvalidStateError':'A microphone session is already running. Stop it before starting again.',
 'NotAllowedError':'Microphone access is denied. Allow Microphone in this site’s browser permissions and retry.',
 'SecurityError':'The browser blocked microphone access in this view. Open the app in a separate browser tab.'
} as Record<string,string>)[code]||'Voice typing could not start ('+code+'). Try again in a separate browser tab.';
export function createDictation(Recognition:any,lang:string,callbacks:{state:(s:VoiceState)=>void;message:(s:string)=>void;interim:(s:string)=>void;append:(s:string)=>void}){
 const r=new Recognition();let disposed=false,failed=false,heard=false,wanted=false,rapidEnds=0,startedAt=0;const committed=new Set<number>();let timer:ReturnType<typeof setTimeout>|undefined;
 const clear=()=>{if(timer)clearTimeout(timer);timer=undefined;};
 const fail=(code:string)=>{if(disposed)return;failed=true;wanted=false;clear();callbacks.state('error');callbacks.interim('');callbacks.message(speechError(code));};
 r.lang=lang;r.continuous=true;r.interimResults=true;r.maxAlternatives=1;
 const begin=()=>{if(disposed||!wanted)return;committed.clear();startedAt=Date.now();callbacks.state('starting');timer=setTimeout(()=>{if(disposed)return;fail('start-timeout');r.abort();},15000);try{r.start();}catch(e:any){fail(e?.name||'start-error');}};
 r.onstart=()=>{if(disposed)return;clear();callbacks.state('listening');callbacks.message('Listening — speak naturally. Finished words are added to your diary.');};
 r.onresult=(event:any)=>{if(disposed||failed)return;let final='',interim='';for(let i=0;i<event.results.length;i++){const result=event.results[i];const text=String(result?.[0]?.transcript||'').trim();if(result.isFinal){if(!committed.has(i)){committed.add(i);if(text)final+=(final?' ':'')+text;}}else interim+=(interim?' ':'')+text;}if(final){heard=true;callbacks.append(final);}callbacks.interim(interim);};
 r.onerror=(event:any)=>{if(disposed)return;if(event.error==='no-speech'&&wanted){callbacks.message('Still listening — you can pause and continue speaking.');return;}if(event.error==='aborted'&&!wanted)return;fail(event.error||'unknown');};
 r.onend=()=>{clear();if(disposed)return;callbacks.interim('');if(wanted&&!failed){rapidEnds=Date.now()-startedAt<5000?rapidEnds+1:0;if(rapidEnds>=5){fail('repeated-disconnect');return;}callbacks.state('starting');callbacks.message('Keeping voice typing on — reconnecting microphone…');timer=setTimeout(begin,350);return;}if(!failed){callbacks.state('idle');callbacks.message(heard?'Voice typing finished. Review your text before saving.':'Voice typing stopped.');}};
 return {start(){if(disposed||wanted)return;failed=false;heard=false;wanted=true;rapidEnds=0;callbacks.message('Waiting for microphone access… Choose Allow if your browser asks.');begin();},stop(){if(disposed)return;wanted=false;clear();callbacks.state('stopping');callbacks.message('Finishing dictation…');timer=setTimeout(()=>{if(disposed||failed)return;r.abort();callbacks.state('idle');callbacks.message('Voice typing stopped.');},2500);try{r.stop();}catch{clear();callbacks.state('idle');callbacks.message('Voice typing stopped.');}},abort(){disposed=true;wanted=false;clear();r.onstart=r.onresult=r.onerror=r.onend=null;try{r.abort();}catch{}}};
}
