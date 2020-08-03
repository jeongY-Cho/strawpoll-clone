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

  vote = async (id: string, item: number) => {
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
  };
}
