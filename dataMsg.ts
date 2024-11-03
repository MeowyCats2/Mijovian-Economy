import type { TextChannel } from "discord.js";
import { client } from "./client.js";

export const dataMsg = await ((await client.channels.fetch("1301036155390656533")) as TextChannel).messages.fetch("1301037287735296020")
export const data = JSON.parse(await (await fetch([...dataMsg.attachments.values()][0].url)).text())
export const saveData = async () => await dataMsg.edit({
    "files": [
        {
            "attachment": Buffer.from(JSON.stringify(data), "utf8"),
            "name": "data.json"
        }
    ]
})