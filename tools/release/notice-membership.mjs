import assert from 'node:assert/strict';
export function verifyMembership(inventory,rust,gateway){
 const check=(actual,expected,key,fields)=>{
  assert.ok(expected.length);assert.equal(actual.length,expected.length,'Incomplete dependency notice inventory');
  const rows=new Map();for(const row of actual){assert.ok(!rows.has(key(row)),'Duplicate dependency notice row');rows.set(key(row),row);}
  for(const row of expected){const found=rows.get(key(row));assert.ok(found,'Missing dependency notice row');for(const field of fields)assert.equal(found[field],row[field],field);}
 };
 check(inventory.rust,rust,v=>v.name+'@'+v.version,['checksum']);
 check(inventory.gateway,gateway,v=>v.path,['version','integrity','origin']);
}
