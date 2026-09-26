export const SUPPORTED_LICENSE_CENTER_CAPABILITIES=new Set([
  'obra.company.read',
  'obra.company.create',
  'obra.company.update-license',
  'obra.device.control',
  'debora.license.manage',
  'debora.observability.read',
  'debora.manual-sales.manage',
  'debora.partners.manage',
  'owner.license.audit',
  'loja-online.company.read',
  'loja-online.company.create',
  'loja-online.license.update',
  'loja-online.license.extend',
  'loja-online.license.block'
]);

export function compareCapabilities(required=[],supported=SUPPORTED_LICENSE_CENTER_CAPABILITIES){
  const missing=[...new Set(required.map(String))].filter(id=>!supported.has(id)).sort();
  return missing.length?{status:'incomplete',missing}:{status:'complete',missing:[]};
}
