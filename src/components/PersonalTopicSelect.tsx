import { useStore } from '../store/useStore';
import type { TaxonomyNode } from '../types';

function flatten(nodes: TaxonomyNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap(node => [
    { id: node.id, label: `${'　'.repeat(depth)}${node.label}` },
    ...flatten(node.children || [], depth + 1),
  ]);
}

export function PersonalTopicSelect({ value, onChange, id, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  id: string;
  disabled?: boolean;
}) {
  const taxonomies = useStore(state => state.taxonomies);
  return <select id={id} value={value} disabled={disabled}
    onChange={event => onChange(event.target.value)}
    className="w-full rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm disabled:opacity-50">
    <option value="">暫不分類</option>
    {flatten(taxonomies).map(node => <option key={node.id} value={node.id}>{node.label}</option>)}
  </select>;
}
