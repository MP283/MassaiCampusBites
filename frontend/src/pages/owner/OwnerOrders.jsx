import { useState } from 'react';
import { useFetch } from '../../hooks';
import OrderFilters, { toParams } from '../../components/OrderFilters';
import OwnerOrderList from '../../components/OwnerOrderList';
import { Alert, LoadingPage, Pagination } from '../../components/ui';

const QUICK = [['', 'All'], ['PLACED', 'New'], ['ACCEPTED', 'Accepted'], ['PREPARING', 'Preparing'], ['READY', 'Ready'], ['ASSIGNED', 'Assigned'], ['OUT_FOR_DELIVERY', 'On the way'], ['DELIVERED', 'Delivered']];

export default function OwnerOrders() {
  const [filters, setFilters] = useState({ page: 1 });
  const { data, loading, error, reload, setData } = useFetch('/owner/orders', toParams(filters));
  const { data: partners } = useFetch('/owner/delivery-partners');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Order management</h1>
          <p>Accept orders, update preparation status and assign delivery partners.</p>
        </div>
        <button className="btn btn-outline" onClick={reload}>↻ Refresh</button>
      </div>
      <div className="tabs">
        {QUICK.map(([s, text]) => (
          <button key={s} className={`tab ${(filters.status || '') === s ? 'active' : ''}`} onClick={() => setFilters({ ...filters, status: s, page: 1 })}>{text}</button>
        ))}
      </div>
      <OrderFilters value={filters} onChange={setFilters} />
      <Alert>{error}</Alert>
      {loading && !data ? <LoadingPage /> : (
        <>
          <OwnerOrderList orders={data?.items || []} partners={partners}
            onUpdated={(o) => setData((d) => ({ ...d, items: d.items.map((x) => (x.id === o.id ? o : x)) }))} />
          {data && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => setFilters({ ...filters, page: p })} />}
        </>
      )}
    </>
  );
}
