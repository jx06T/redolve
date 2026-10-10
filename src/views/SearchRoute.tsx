import { Navigate, useLocation } from 'react-router-dom';
import { QuestionLibraryView } from './QuestionLibraryView';
export function SearchRoute() {
  const location=useLocation();const params=new URLSearchParams(location.search);
  if(!params.has('source')&&params.has('scope')) {
    const scope=params.get('scope'),id=params.get('collection_id');
    params.delete('scope');params.delete('subscribed');
    if(scope==='public')return <Navigate replace to={`/explore?${params}`}/>;
    if(scope==='shared')return <Navigate replace to={`${id?`/collections/${encodeURIComponent(id)}`:'/extended'}?${params}`}/>;
    params.set('source',params.get('origin')==='saved'?'saved':'owned');params.delete('origin');
    return <Navigate replace to={`/search?${params}`}/>;
  }
  return <QuestionLibraryView search/>;
}
