import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class MeetupService {
  constructor(private readonly prisma: PrismaService) {}

  async createMeetup(
    hostId: string,
    dto: { title: string; description?: string; city: string; placeId?: string; date: string; maxAttendees?: number; isPublic?: boolean },
  ) {
    return this.prisma.meetupEvent.create({
      data: {
        hostId,
        title: dto.title,
        description: dto.description,
        city: dto.city,
        placeId: dto.placeId,
        date: new Date(dto.date),
        maxAttendees: dto.maxAttendees,
        isPublic: dto.isPublic ?? true,
      },
    });
  }

  async listMeetups(city?: string, limit = 30, userId?: string) {
    const now = new Date();
    const meetups = await this.prisma.meetupEvent.findMany({
      where: {
        date: { gte: now },
        isPublic: true,
        ...(city ? { city: { contains: city, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { date: 'asc' },
      take: limit,
    });

    const ids = meetups.map((m) => m.id);
    const hostIds = [...new Set(meetups.map((m) => m.hostId))];

    const [rsvps, hosts, myRsvps] = await Promise.all([
      this.prisma.meetupRsvp.groupBy({ by: ['meetupId'], _count: { userId: true }, where: { meetupId: { in: ids } } }),
      this.prisma.user.findMany({ where: { id: { in: hostIds } }, select: { id: true, displayName: true, photoUrl: true } }),
      userId ? this.prisma.meetupRsvp.findMany({ where: { meetupId: { in: ids }, userId }, select: { meetupId: true, status: true } }) : Promise.resolve([]),
    ]);

    const rsvpMap = Object.fromEntries(rsvps.map((r) => [r.meetupId, r._count.userId]));
    const hostMap = Object.fromEntries(hosts.map((h) => [h.id, h]));
    const myRsvpMap = Object.fromEntries((myRsvps as Array<{ meetupId: string; status: string }>).map((r) => [r.meetupId, r.status]));

    return meetups.map((m) => ({
      ...m,
      attendeesCount: rsvpMap[m.id] ?? 0,
      host: hostMap[m.hostId] ?? null,
      myStatus: myRsvpMap[m.id] ?? null,
    }));
  }

  async getMeetup(meetupId: string, userId?: string) {
    const meetup = await this.prisma.meetupEvent.findUnique({ where: { id: meetupId } });
    if (!meetup) throw new NotFoundException('Meetup introuvable');

    const [rsvps, host, myRsvp] = await Promise.all([
      this.prisma.meetupRsvp.findMany({ where: { meetupId, status: 'going' }, take: 50 }),
      this.prisma.user.findUnique({ where: { id: meetup.hostId }, select: { id: true, displayName: true, photoUrl: true } }),
      userId ? this.prisma.meetupRsvp.findUnique({ where: { meetupId_userId: { meetupId, userId } } }) : null,
    ]);

    const attendeeIds = rsvps.map((r) => r.userId);
    const attendees = await this.prisma.user.findMany({
      where: { id: { in: attendeeIds } },
      select: { id: true, displayName: true, photoUrl: true },
    });

    return { ...meetup, host, attendees, attendeesCount: rsvps.length, myStatus: myRsvp?.status ?? null };
  }

  async rsvp(meetupId: string, userId: string, status: 'going' | 'interested' | 'cancel') {
    const meetup = await this.prisma.meetupEvent.findUnique({
      where: { id: meetupId },
      select: { id: true, maxAttendees: true },
    });
    if (!meetup) throw new NotFoundException('Meetup introuvable');

    if (status === 'cancel') {
      await this.prisma.meetupRsvp.deleteMany({ where: { meetupId, userId } });
      return { status: 'cancelled' };
    }

    if (meetup.maxAttendees) {
      const count = await this.prisma.meetupRsvp.count({ where: { meetupId, status: 'going' } });
      if (count >= meetup.maxAttendees && status === 'going') throw new BadRequestException('Meetup complet');
    }

    await this.prisma.meetupRsvp.upsert({
      where: { meetupId_userId: { meetupId, userId } },
      update: { status },
      create: { meetupId, userId, status },
    });
    return { status };
  }

  async getMyMeetups(userId: string) {
    const [hosted, attending] = await Promise.all([
      this.prisma.meetupEvent.findMany({
        where: { hostId: userId, date: { gte: new Date() } },
        orderBy: { date: 'asc' },
        take: 20,
      }),
      this.prisma.meetupRsvp.findMany({
        where: { userId, status: 'going' },
        take: 20,
      }),
    ]);

    const attendingIds = attending.map((r) => r.meetupId);
    const attendingMeetups = await this.prisma.meetupEvent.findMany({
      where: { id: { in: attendingIds }, date: { gte: new Date() } },
      orderBy: { date: 'asc' },
    });

    return { hosted, attending: attendingMeetups };
  }
}
