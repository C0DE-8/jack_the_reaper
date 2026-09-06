'use strict';
require('dotenv').config();
const {tick}=require('../services/activityTelegram');
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
(async()=>{do {try {await tick();} catch {console.error('Activity worker failed');} if(process.argv.includes('--once')||stopping) break; await new Promise(resolve=>setTimeout(resolve,5000));} while(!stopping); await require('../db').end();})();
