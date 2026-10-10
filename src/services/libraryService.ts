import { sharingApi, type SavedDetail } from './sharingApi';
export const libraryService={
  save:(entryId:string)=>sharingApi<{saved_id:string;status:string}>('/saved','POST',{entry_id:entryId}),
  inspectSave:(entryId:string)=>sharingApi<{existing_id:string|null;own_source:boolean}>(
    `/saved/inspect?entry_id=${encodeURIComponent(entryId)}`),
  get:(id:string,signal?:AbortSignal)=>sharingApi<SavedDetail>(`/saved/${encodeURIComponent(id)}`,'GET',undefined,signal),
  previewUpdate:(id:string)=>sharingApi<{available:boolean;changed:boolean;collection_id?:string;
    entry_id?:string;content_seq?:number;shared_seq?:number;acl_version?:number;changes:string[]}>(
      `/saved/${encodeURIComponent(id)}/source-update`),
  update:(id:string,version:{content_seq?:number;shared_seq?:number;acl_version?:number})=>
    sharingApi(`/saved/${encodeURIComponent(id)}/refresh-source`,'POST',version),
  patch:(id:string,patch:Record<string,unknown>)=>sharingApi<{row_version:number}>(`/saved/${encodeURIComponent(id)}`,'PATCH',patch),
  retryClassification:(id:string)=>sharingApi(`/saved/${encodeURIComponent(id)}/retry-classification`,'POST',{}),
  remove:(id:string)=>sharingApi(`/saved/${encodeURIComponent(id)}`,'DELETE'),
};
