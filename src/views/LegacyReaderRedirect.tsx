import { Navigate, useParams } from 'react-router-dom';
export function LegacyReaderRedirect({saved=false}:{saved?:boolean}) {
  const {id='',entryId=''}=useParams();
  return <Navigate replace to={saved?`/study?source=saved&focus=${encodeURIComponent(id)}`:
    `/collections/${encodeURIComponent(id)}?focus=${encodeURIComponent(entryId)}`}/>;
}
