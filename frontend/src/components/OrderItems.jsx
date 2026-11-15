import { money } from './ui';

export default function OrderItems({ order, compact }) {
  if (compact) {
    return <span className="small muted">{order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</span>;
  }
  return (
    <table className="table">
      <tbody>
        {order.items.map((i) => (
          <tr key={i.id}>
            <td>{i.quantity} × {i.name}</td>
            <td className="nowrap muted small">{money(i.unit_price)} each</td>
            <td className="nowrap" style={{ textAlign: 'right' }}>{money(i.unit_price * i.quantity)}</td>
          </tr>
        ))}
        <tr>
          <td colSpan={2}><b>Total</b></td>
          <td style={{ textAlign: 'right' }}><b>{money(order.total_amount)}</b></td>
        </tr>
      </tbody>
    </table>
  );
}
