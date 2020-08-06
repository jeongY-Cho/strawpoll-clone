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

// uses prisma client to connect to the underlying db
export default class DBConnector {
  prisma = new PrismaClient();

  // creates a new poll and creates related choices
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

    // retrieve the new project for the default assigned items
    const poll = await this.get(ret.id);
    if (!poll) throw new Error("no poll but it was just made");
    return poll;
  }

  // get a poll object
  async get(id: string) {
    return await this.prisma.poll.findOne({
      where: { id },
      include: {
        choices: {
          // choices are always sorted by ascending for consistency
          orderBy: { id: "asc" },
          // omit id from choice obj
          select: { count: true, text: true },
        },
      },
    });
  }

  // vote on a choice
  async vote(id: string, item: number) {
    // check that id is actually a uuid and not a sql injection
    if (!isUUID.anyNonNil(id)) {
      throw new Error("invalid id, is not uuid");
    }
    // check that item is a number and not a sql injection
    if (typeof item !== "number") {
      throw new Error("invalid item");
    }
    // FIXME: need to use raw sql for atomic update, fix when prisma implements atomic increments
    const updated = await this.prisma.executeRaw(
      "UPDATE Choice SET count = count + 1 WHERE id = (SELECT id FROM Choice WHERE pollId = $1 ORDER BY id LIMIT 1 OFFSET $2);",
      id,
      item
    );
    if (updated) {
      // FIXME: need to use raw sql for atomic update, fix when prisma implements atomic increments
      const totalUpdated = await this.prisma.executeRaw(
        "UPDATE Poll SET total = total + 1 WHERE id = $1",
        id
      );
      return true;
    } else {
      return false;
    }
  }

  // push a complete update of poll numbers
  async push(id: string, counts: { [key: string]: any }) {
    // get choice ids for a poll id
    const choices = await this.prisma.poll
      .findOne({
        where: { id },
      })
      .choices({
        // order by id for consistency
        orderBy: { id: "asc" },
      });
    // queue for updates
    let updates: any[] = [];

    // queue total count update
    updates.push(
      this.prisma.poll.update({
        where: { id },
        data: { total: parseInt(counts.total) },
      })
    );

    // queue choice updates
    for (let i in choices) {
      const choiceKey = "choice:" + i;
      const update = this.prisma.choice.update({
        where: { id: choices[i].id },
        data: { count: parseInt(counts[choiceKey]) },
      });
      updates.push(update);
    }
    console.log("writeBehind", id);
    // execute queued updates as transaction.
    return this.prisma.$transaction(updates);
  }
}
