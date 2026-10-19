import {spawn} from 'node:child_process';
const env={...process.env};
for(const key of Object.keys(env)) if(key.startsWith('HERDR')) delete env[key];
const child=spawn(process.argv[2],['-c','tui.status_line=["rainbow-hud"]'],{stdio:'inherit',env});
child.on('error',error=>{console.error(error);process.exit(1)});
for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>{try{child.kill(signal)}catch{}});
child.on('exit',code=>process.exit(code??1));
