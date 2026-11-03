type AIContext={operation:string;model:string};
export class AIProviderError extends Error {
  constructor(public code:string,message:string,public diagnostic:{provider:'gemini';operation:string;model:string;
    httpStatus?:number;providerStatus?:string;reason:string;retryable:boolean},public allowFallback=false){
    super(message);this.name='AIProviderError';
  }
}
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'?value as Record<string,unknown>:{};
/** Classify upstream errors without logging keys, headers, input, or raw response text. */
export function providerError(error:unknown,context:AIContext):AIProviderError {
  if(error instanceof AIProviderError)return error;
  const outer=record(error);let parsed:Record<string,unknown>={};
  if(typeof outer.message==='string'){try{parsed=record(JSON.parse(outer.message));}catch{/* Non-JSON errors are classified locally. */}}
  const detail=record(parsed.error||outer.error),raw=String(detail.message||outer.message||'');
  const status=Number(outer.status||detail.code||outer.code),httpStatus=Number.isInteger(status)&&status>=100&&status<=599?status:undefined;
  const upstream=typeof detail.status==='string'&&/^[A-Z_]{1,80}$/.test(detail.status)?detail.status:undefined;
  const base={provider:'gemini' as const,operation:context.operation,model:context.model.replace(/AIza[\w-]+/g,'[redacted]').slice(0,100),httpStatus,providerStatus:upstream};
  const make=(code:string,message:string,reason:string,retryable=false,allowFallback=false)=>new AIProviderError(code,message,{...base,reason,retryable},allowFallback);
  // RESOURCE_EXHAUSTED can mean either billing (402) or rate/quota limits (429).
  if(httpStatus===402||/prepay(?:ment)? credits?.*(?:depleted|exhausted)/i.test(raw))
    return make('AI_BILLING_REQUIRED','AI 服務額度不足，請聯絡管理者檢查帳務；原資料已保留。','PREPAY_CREDITS_DEPLETED');
  if(httpStatus===401)return make('AI_AUTH_FAILED','AI 服務憑證無效，請聯絡管理者檢查設定；原資料已保留。','AUTHENTICATION_FAILED');
  if(httpStatus===403)return make('AI_ACCESS_DENIED','AI 服務權限受限，請聯絡管理者檢查設定；原資料已保留。','PERMISSION_DENIED');
  if(/location is not supported|unsupported (?:location|region)/i.test(raw))
    return make('AI_REGION_UNSUPPORTED','AI 服務執行區域目前不受支援，請聯絡管理者；原資料已保留。','REGION_UNSUPPORTED');
  if(httpStatus===429)return make('AI_RATE_LIMITED','AI 服務目前額度或流量受限，請稍後重試；原資料已保留。','RATE_OR_QUOTA_LIMITED',true);
  if(httpStatus===404)return make('AI_MODEL_UNAVAILABLE','AI 模型目前無法使用，請聯絡管理者檢查設定；原資料已保留。','MODEL_UNAVAILABLE',false,true);
  if(httpStatus===400)return make('AI_REQUEST_REJECTED','AI 服務拒絕這次請求，請聯絡管理者檢查設定；原資料已保留。','REQUEST_REJECTED');
  if(httpStatus&&httpStatus>=500)return make('AI_UNAVAILABLE','AI 服務暫時無法使用，請稍後重試；原資料已保留。','UPSTREAM_UNAVAILABLE',true,true);
  if(outer.name==='AbortError'||outer.name==='TimeoutError')return make('AI_TIMEOUT','AI 處理逾時，請稍後重試；原資料已保留。','TIMEOUT',true,true);
  if(outer.name==='TypeError')return make('AI_UNAVAILABLE','目前無法連線至 AI 服務，請稍後重試；原資料已保留。','NETWORK_ERROR',true,true);
  return make('AI_INVALID_RESPONSE','AI 尚未傳回可用結果，可手動重試；原資料已保留。','INVALID_RESPONSE',true,true);
}
export function reportProviderError(error:unknown,context:AIContext){
  const failure=providerError(error,context);console.warn('[AIProvider] Request failed',failure.diagnostic);return failure;
}
export const aiFailureMessage=(error:unknown,fallback:string)=>error instanceof AIProviderError?error.message:fallback;
export const aiFailureDiagnostic=(error:unknown)=>error instanceof AIProviderError?error.diagnostic:{name:error instanceof Error?error.name:'unknown'};

/** Read at most 8 KiB of an error response; never retain a full HTML/proxy response. */
export async function responseError(response:Response):Promise<unknown>{
  const reader=response.body?.getReader();if(!reader)return{status:response.status};
  const decoder=new TextDecoder();let text='',size=0;
  try{
    while(size<8192){const part=await reader.read();if(part.done)break;const bytes=part.value.subarray(0,8192-size);size+=bytes.length;text+=decoder.decode(bytes,{stream:true});}
    text+=decoder.decode();
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  return{status:response.status,message:text};
}
