import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

const DEFAULT_QUESTS = [
  { title: 'Premier pas', description: 'Visite ton premier lieu', emoji: '👣', type: 'visit_count', target: 1, xpReward: 50 },
  { title: 'Explorateur', description: 'Visite 10 lieux différents', emoji: '🧭', type: 'visit_count', target: 10, xpReward: 200 },
  { title: 'Aventurier', description: 'Visite 50 lieux', emoji: '🗺️', type: 'visit_count', target: 50, xpReward: 500 },
  { title: 'Foodie', description: 'Visite 5 restaurants', emoji: '🍽️', type: 'universe_visit', target: 5, universe: 'restaurant', xpReward: 150 },
  { title: 'Café addict', description: 'Visite 5 cafés', emoji: '☕', type: 'universe_visit', target: 5, universe: 'cafe', xpReward: 150 },
  { title: 'Noctambule', description: 'Visite 3 boîtes de nuit', emoji: '🎉', type: 'universe_visit', target: 3, universe: 'nightclub', xpReward: 200 },
  { title: 'Critique', description: 'Publie 5 avis', emoji: '✍️', type: 'review_count', target: 5, xpReward: 150 },
  { title: 'Grand critique', description: 'Publie 20 avis', emoji: '📝', type: 'review_count', target: 20, xpReward: 400 },
  { title: 'Social butterfly', description: 'Suis 5 utilisateurs', emoji: '🦋', type: 'friend_count', target: 5, xpReward: 100 },
  { title: 'Swipeur fou', description: 'Swipe 100 lieux', emoji: '💫', type: 'swipe_count', target: 100, xpReward: 200 },
  { title: 'Culture', description: 'Visite 3 musées', emoji: '🏛️', type: 'universe_visit', target: 3, universe: 'museum', xpReward: 150 },
  { title: 'Bien-être', description: 'Visite 3 spas ou massages', emoji: '💆', type: 'universe_visit', target: 3, universe: 'spa', xpReward: 150 },
  { title: 'Sportif', description: 'Visite 5 salles de sport', emoji: '💪', type: 'universe_visit', target: 5, universe: 'fitness', xpReward: 200 },
  { title: 'Nature lover', description: 'Visite 5 parcs ou plages', emoji: '🌿', type: 'universe_visit', target: 5, universe: 'park', xpReward: 150 },
];

@Injectable()
export class QuestsService implements OnModuleInit {
  private readonly logger = new Logger(QuestsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const count = await this.prisma.quest.count();
    if (count === 0) {
      await this.prisma.quest.createMany({ data: DEFAULT_QUESTS });
      this.logger.log(`[quests] ${DEFAULT_QUESTS.length} quêtes créées`);
    }
  }

  async listActiveQuests() {
    return this.prisma.quest.findMany({ where: { isActive: true }, orderBy: { xpReward: 'asc' } });
  }

  async getUserQuests(userId: string) {
    const [quests, userQuests] = await Promise.all([
      this.prisma.quest.findMany({ where: { isActive: true } }),
      this.prisma.userQuest.findMany({ where: { userId } }),
    ]);
    const progressMap = Object.fromEntries(userQuests.map((uq) => [uq.questId, uq]));
    return quests.map((q) => ({
      ...q,
      progress: progressMap[q.id]?.progress ?? 0,
      completed: progressMap[q.id]?.completed ?? false,
      completedAt: progressMap[q.id]?.completedAt ?? null,
    }));
  }

  async incrementProgress(userId: string, type: string, universe?: string, amount = 1) {
    const quests = await this.prisma.quest.findMany({
      where: { isActive: true, type, ...(universe ? { OR: [{ universe }, { universe: null }] } : {}) },
    });
    for (const quest of quests) {
      const uq = await this.prisma.userQuest.upsert({
        where: { userId_questId: { userId, questId: quest.id } },
        update: { progress: { increment: amount } },
        create: { userId, questId: quest.id, progress: amount },
      });
      if (!uq.completed && uq.progress >= quest.target) {
        await this.prisma.userQuest.update({
          where: { userId_questId: { userId, questId: quest.id } },
          data: { completed: true, completedAt: new Date() },
        });
        await this.prisma.user.update({
          where: { id: userId },
          data: { totalXp: { increment: quest.xpReward } },
        });
      }
    }
  }
}
