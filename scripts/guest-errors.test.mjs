import test from 'node:test';
import assert from 'node:assert/strict';
import {guestErrorCode} from '../assets/guest-errors.js';
test('Guest failures distinguish gateway JWT, missing function, startup, network and server validation without exposing details',async()=>{
 const error=(status,body)=>({context:Response.json(body,{status})});
 assert.equal(await guestErrorCode(error(401,{message:'Invalid JWT'})),'GUEST_JWT_REJECTED');
 assert.equal(await guestErrorCode(error(404,{code:'NOT_FOUND'})),'GUEST_FUNCTION_MISSING');
 assert.equal(await guestErrorCode(error(503,{code:'BOOT_ERROR'})),'GUEST_FUNCTION_START_FAILED');
 assert.equal(await guestErrorCode({name:'FunctionsFetchError'}),'GUEST_CONNECTION_FAILED');
 assert.equal(await guestErrorCode(error(403,{error:'INVALID_PASSWORD'})),'INVALID_PASSWORD');
 assert.equal(await guestErrorCode(error(503,{error:'GUEST_SETUP_REQUIRED'})),'GUEST_SETUP_REQUIRED');
 assert.equal(await guestErrorCode(error(500,{message:'sensitive database details'})),'GUEST_REQUEST_FAILED');
});
