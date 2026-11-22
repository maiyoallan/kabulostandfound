import { prisma } from '../db.js';
import { sendMatchEmail } from './notify.js';
export async function notifyMatches(found) {
  if (found.type !== 'FOUND') return;
  const tokens = found.title.toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>2);
  const lost = await prisma.item.findMany({where:{type:'LOST',status:{in:['UNCLAIMED','CLAIM_PENDING']},category:found.category,userId:{not:found.userId}},include:{user:true}});
  for (const item of lost) {
    const haystack = `${item.title} ${item.description}`.toLowerCase();
    const matched = item.category === found.category || tokens.some(t=>haystack.includes(t));
    if (!matched) continue;
    await prisma.notification.create({data:{userId:item.userId,type:'MATCH',title:'Possible item match',body:`A newly found item may match “${item.title}”. Check the listing on KABU Lost & Found.`,itemId:found.id}});
    await sendMatchEmail(item.user.email, item.title).catch(()=>{});
  }
}
