import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function backfillCommentMessages() {
  const comments = await prisma.budgetComment.findMany({
    include: { messages: true }
  });
  
  let backfilled = 0;
  for (const comment of comments) {
    const hasInitialMessage = comment.messages.some(
      m => m.authorType === 'CLIENT' && m.content === comment.content
    );
    
    if (!hasInitialMessage) {
      await prisma.commentMessage.create({
        data: {
          commentId: comment.id,
          authorType: 'CLIENT',
          authorName: comment.commenterName,
          authorEmail: comment.commenterEmail,
          content: comment.content,
          createdAt: comment.createdAt,
        }
      });
      backfilled++;
    }
  }
  
  console.log(`Backfilled ${backfilled} comment(s) with initial messages`);
  await prisma.$disconnect();
}

backfillCommentMessages().catch(console.error);
