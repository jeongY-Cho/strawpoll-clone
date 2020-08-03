import { PrismaClient, Poll } from "@prisma/client";
import isUUID from "is-uuid";

export type NewPollOptions = {
  prompt: string;
  choices: string[];
};

export type IPollAgg = Poll & {
  choices: {
    count: number;
    text: string;
  }[];
};

export default class PollsStore {
  prisma = new PrismaClient();

  async new(newPoll: NewPollOptions): Promise<IPollAgg> {
    let ret = await this.prisma.poll.create({
      data: {
        prompt: newPoll.prompt,
        choices: {
          create: newPoll.choices.reduce((acc, cur) => {
            acc.push({ text: cur });
            return acc;
          }, [] as { text: string }[]),
        },
      },
    });

    const poll = await this.get(ret.id);
    if (!poll) throw new Error("no poll but it was just made");
    return poll;
  }

  async get(id: string) {
    return await this.prisma.poll.findOne({
      where: { id },
      include: {
        choices: {
          orderBy: { id: "asc" },
          select: { count: true, text: true },
        },
      },
    });
  }

  async vote(id: string, item: number) {
    if (!isUUID.anyNonNil(id)) {
      throw new Error("invalid id, is not uuid");
    }
    const updated = await this.prisma.executeRaw(
      "UPDATE Choice SET count = count + 1 WHERE id = (SELECT id FROM Choice WHERE pollId = $1 ORDER BY id LIMIT 1 OFFSET $2);",
      id,
      item
    );
    if (updated) {
      const totalUpdated = await this.prisma.executeRaw(
        "UPDATE Poll SET total = total + 1 WHERE id = $1",
        id
      );
      return true;
    } else {
      return false;
    }
  }
}
