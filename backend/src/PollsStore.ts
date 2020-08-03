import { PrismaClient } from "@prisma/client";
import isUUID from "is-uuid";

type NewPollOptions = {
  prompt: string;
  choices: string[];
};

export default class PollsStore {
  prisma = new PrismaClient();

  new = async (newPoll: NewPollOptions) => {
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

    return ret.id;
  };

  get = async (id: string) => {
    return await this.prisma.poll.findOne({
      where: { id },
      include: { choices: true },
    });
  };

  vote = async (id: string, item: string | number) => {
    if (!isUUID.anyNonNil(id)) {
      throw new Error("invalid id, is not uuid");
    }
    console.log(id, item);
    const poll = await this.prisma.poll.findOne({ where: { id } });
    console.log(poll);
    if (typeof item === "string") {
      const choice = (
        await this.prisma.choice.findMany({
          where: { pollId: id, text: item },
        })
      )[0];
      const updatedChoice = await this.prisma.choice.updateMany({
        where: { pollId: id, text: item },
        data: {
          count: choice.count + 1,
        },
      });
    } else {
      const choice = (
        await this.prisma.choice.findMany({
          orderBy: { id: "asc" },
          where: { pollId: id },
        })
      )[item];
      await this.prisma.choice.update({
        where: { id: choice.id },
        data: { count: choice.count + 1 },
      });
    }
    const tt = await this.prisma.poll.update({
      where: { id },
      data: { total: poll!.total + 1 },
    });
  };
}
