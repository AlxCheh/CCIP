import React from 'react';
import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <h2>Доступ запрещён</h2>
      <p>У вашей роли нет доступа к этому разделу.</p>
      <Link to="/">На главную</Link>
    </div>
  );
}
