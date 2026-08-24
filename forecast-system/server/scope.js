// يبني شرط WHERE إضافي يحصر بيانات المندوب على عملائه فقط، ولا يفعل شيئاً للـ admin
function repScopeSql(req, column, params) {
  if (req.user.role === 'admin') return '';
  params.push(req.user.repName || '__none__');
  return ` AND ${column} = $${params.length}`;
}

module.exports = { repScopeSql };
