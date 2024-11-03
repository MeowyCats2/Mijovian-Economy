import { client } from "./client.ts"
import "./webserver.ts"
import { Events, SlashCommandBuilder, Routes, ButtonStyle, ComponentType, SlashCommandUserOption, PermissionsBitField, SlashCommandIntegerOption, SlashCommandStringOption, TextInputStyle } from "discord.js"
import type { TextBasedChannel, TextChannel, Message, GuildMember, Snowflake, APIMessageActionRowComponent, BaseMessageOptions, Guild, ChatInputCommandInteraction, ButtonInteraction, ModalSubmitInteraction } from "discord.js"
import { data, saveData } from "./dataMsg.ts"

client.setMaxListeners(0);
const getTodayDate = () => (new Date()).getUTCFullYear() + "-" + (new Date()).getUTCMonth() + "-" + (new Date()).getUTCDate()
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName !== "daily") return;
	if (data.dailyCooldowns[interaction.guild!.id]?.[interaction.user.id] === getTodayDate()) return await interaction.reply("You already did your daily today. Try again tommorow.")
	await interaction.reply({
		content: "You can either choose to risk for the beef which has a 50% chance for your reward to be doubled, but also a chance for your reward to be gone entirely, or play it safe and choose the chicken.",
		components: [
			{
				"components": [
					{
						"customId": "daily.beef",
						"emoji": "1295620136769818625",
						"label": "Beef",
						"style": ButtonStyle.Danger,
						"type": ComponentType.Button
					},
					{
						"customId": "daily.chicken",
						"emoji": "1295619902014488576",
						"label": "Chicken",
						"style": ButtonStyle.Secondary,
						"type": ComponentType.Button
					}
				],
				"type": ComponentType.ActionRow
			}
		]
    })
})
const dailyUpdateListeners: {
	[guildId: Snowflake]: ((percent: number) => void)[]
} = {}
let cachedDailies: {
	[guildId: Snowflake]: Message[]
} = {}
let lastDailyCache = getTodayDate()
const runningDailies: Snowflake[] = []
const dailyFinishListeners: {
	[guildId: Snowflake]: ((...args: any[]) => void)[]
} = {}
const getYesterday = () => {
	const yesterday = new Date()
	yesterday.setUTCDate((new Date()).getUTCDate() - 1)
	yesterday.setUTCHours(0)
	yesterday.setUTCMinutes(0)
	yesterday.setUTCSeconds(0)
	yesterday.setUTCMilliseconds(0)
	return yesterday
}
const calculateDailies = async (guild: Guild) => {
	runningDailies.push(guild.id)
	let lastUpdate = Date.now()
	let guildMessages: Message[] = []
	const yesterday = getYesterday()
	const channelList = [...(await guild!.channels.fetch()).values()]
	for (const [index, channel] of channelList.entries()) {
		if (!channel) continue
		if (!channel.permissionsFor(guild!.members.me as GuildMember).has(PermissionsBitField.Flags.ViewChannel) || !channel.permissionsFor(guild.members.me as GuildMember).has(PermissionsBitField.Flags.ReadMessageHistory)) continue
		console.log(channel!.id + " performing...")
		try {
			const handleMessages = async (textChannel: TextBasedChannel) => {
				let channelMessages = [...(await textChannel.messages.fetch({limit: 100})).sort((a, b) => a.createdTimestamp - b.createdTimestamp).values()]
				if (channelMessages.length === 0) return
				console.log("Message found!")
				while (1) {
					const fetched = [...(await textChannel.messages.fetch({limit: 100, before: channelMessages[0]!.id})).sort((a, b) => a.createdTimestamp - b.createdTimestamp).values()]
					if (fetched.length < 100) break
					if (fetched[0]!.createdTimestamp < yesterday.getTime()) break
					console.log(fetched[0]!.createdAt)
					console.log(fetched[0]!.createdTimestamp - yesterday.getTime())
					console.log("Fetching: " + channelMessages.length + " messages")
					channelMessages.unshift(...fetched)
				}
				guildMessages.push(...channelMessages)
			}
			if ((channel as any).messages) await handleMessages(channel as TextBasedChannel)
			if ((channel as any).threads) {
				for (const thread of [...(await (channel as TextChannel).threads.fetch()).threads.values()]) {
					await handleMessages(thread)
				}
			}
			if (Date.now() - lastUpdate > 2000) {
				lastUpdate = Date.now();
				if (guild.id in dailyUpdateListeners) dailyUpdateListeners[guild.id].forEach(listener => listener(Math.round(index / channelList.length * 100)))
			}
		} catch (e) {
			console.log(e)
			console.log(channel.permissionsFor(guild!.members.me as GuildMember).missing(PermissionsBitField.All))
		}
	}
	console.log("Finished!")
	if (lastDailyCache !== getTodayDate()) {
		cachedDailies = {}
		lastDailyCache = getTodayDate()
	}
	cachedDailies[guild.id] = guildMessages
	if (guild.id in dailyFinishListeners) dailyFinishListeners[guild.id].forEach(listener => listener())
	dailyUpdateListeners[guild.id] = [];
	runningDailies.splice(runningDailies.indexOf(guild.id, 1))
	return guildMessages
}
for (const guild of [...client.guilds.cache.values()]) {
	calculateDailies(guild);
}
{
	const now = new Date();
	const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	setTimeout(() => {
		cachedDailies = {};
		for (const guild of [...client.guilds.cache.values()]) {
			calculateDailies(guild);
		}
		setInterval(() => {
			cachedDailies = {};
			for (const guild of [...client.guilds.cache.values()]) {
				calculateDailies(guild);
			}
		}, 24 * 60 * 60 * 1000)
	}, endOfDay.getTime() - now.getTime() + 1000);
}
const getDailies = async (guild: Guild) => {
	if (runningDailies.includes(guild.id)) {
		dailyFinishListeners[guild.id] ??= [];
		await new Promise(res => dailyFinishListeners[guild.id].push(res))
	}
	if (lastDailyCache !== getTodayDate()) {
		cachedDailies = {}
		lastDailyCache = getTodayDate()
		return await calculateDailies(guild)
	}
	if (guild.id in cachedDailies) return cachedDailies[guild.id]
	return await calculateDailies(guild)
}
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton()) return;
	if (!interaction.customId.startsWith("daily.")) return;
	if (data.dailyCooldowns[interaction.guild!.id]?.[interaction.user.id] === getTodayDate()) return await interaction.reply("<@" + interaction.user.id + ">\n" + "You already did your daily today. Try again tommorow.")
	const progressText = interaction.customId === "daily.beef" ? "<a:MG_Dot:1196609416938664066> <:VSD_raw_beef:1295620136769818625> Risking for the beef..." : "<a:MG_Dot:1196609416938664066> <:VSD_raw_chicken:1295619902014488576> Playing with the chicken..."
	interaction.reply("<@" + interaction.user.id + ">\n" + progressText)
	dailyUpdateListeners[interaction.guild!.id] ??= []
	dailyUpdateListeners[interaction.guild!.id].push((percent) => interaction.editReply("<@" + interaction.user.id + ">\n" + progressText + " (" + percent + "%)"))
	const guildMessages = (await getDailies(interaction.guild!)).sort((a, b) => a.createdTimestamp - b.createdTimestamp) 
	await interaction.editReply("Finished.")
	let messageCount = guildMessages.filter(message => message.author.id === interaction.user.id && message.createdTimestamp > getYesterday().getTime()).length
	let earnedMoney = 0
	for (let i = 0; i < messageCount; i++) {
		earnedMoney += Math.floor(Math.random() * 2) + 1
	}
	if (interaction.customId === "daily.beef") {
		if (Math.random() > 0.5) {
			earnedMoney *= 2
		} else {
			return await interaction.followUp("<@" + interaction.user.id + ">\n" + "Unfortunately, you were unlucky and gained no money.")
		}
	}
	data.dailyCooldowns[interaction.guild!.id] ??= {}
	data.dailyCooldowns[interaction.guild!.id][interaction.user.id] = getTodayDate()
	await saveData()
	if (messageCount === 0) return await interaction.followUp("<@" + interaction.user.id + ">\n" + "Looks like you didn't send any messages yesterday.")
	data.wallets[interaction.user.id] ??= 0
	data.wallets[interaction.user.id] += earnedMoney
	await saveData()
	await interaction.followUp("<@" + interaction.user.id + ">\n" + "You earned <:Gray_MJK_icon:1301689133885947976> " + earnedMoney + " Mijovian crowns from the " + messageCount + " messages you sent.")
})
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName !== "wallet") return;
	const user = interaction.options.getUser("user") ?? interaction.user
	if (!(user.id in data.wallets)) return await interaction.reply("No data.")
	await interaction.reply("Wallet: <:Gray_MJK_icon:1301689133885947976> " + data.wallets[user.id] + " Mijovian crowns.")
})
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName !== "rob") return;
	if (data.robCooldowns[interaction.user.id] === getTodayDate()) return await interaction.reply("You already did your rob today. Try again tommorow.")
	const user = interaction.options.getUser("user")!
	if (!(user.id in data.wallets)) return await interaction.reply("No data.")
	const itemId = interaction.options.getString("item")
	let minAmount = 1
	let maxAmount = 50
	if (itemId) {
		if (!(interaction.user.id in data.inventory)) return await interaction.reply("No data.")
		const itemData = items.find(item => item.id === itemId)!
		if (!data.inventory[interaction.user.id][itemId] || data.inventory[interaction.user.id][itemId] === 0) return await interaction.reply("You don't own this item!")
		const robberyAction = itemData.actions?.find(action => action.type === "robbery")
		if (!robberyAction) return await interaction.reply("You cannot rob with this!")
		minAmount = robberyAction.min_amount;
		maxAmount = robberyAction.max_amount;
	}
	data.wallets[interaction.user.id] ??= {}
	data.robCooldowns[interaction.user.id] = getTodayDate()
	await saveData()
	if (Math.random() < 0.5) {
		const fineAmount = Math.min(20, data.wallets[interaction.user.id])
		await interaction.reply("You got caught trying to rob <@" + user.id + "> and was fined <:Gray_MJK_icon:1301689133885947976> " + fineAmount + " Mijovian crowns.")
		data.wallets[interaction.user.id] -= fineAmount
		return await saveData()
	}
	const stolenAmount = Math.floor(Math.random() * (maxAmount - minAmount + 1) + minAmount);
	data.wallets[user.id] -= stolenAmount;
	data.wallets[interaction.user.id] += stolenAmount;
	await saveData();
	await interaction.reply("You robbed <:Gray_MJK_icon:1301689133885947976> " + stolenAmount + " Mijovian crowns from <@" + user.id + ">");
});
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName !== "give_money") return;
	if (!(interaction.user.id in data.wallets)) return await interaction.reply("No data.")
	const user = interaction.options.getUser("user")!
	data.wallets[user.id] ??= {}
	data.wallets[interaction.user.id] -= interaction.options.getInteger("amount")!
	data.wallets[user.id] += interaction.options.getInteger("amount")
	await saveData()
	await interaction.reply("You gave <:Gray_MJK_icon:1301689133885947976> " + interaction.options.getInteger("amount") + " Mijovian crowns to <@" + user.id + ">")
})
interface RoleAddAction {
	type: "role_add",
	guild: Snowflake,
	role: Snowflake
}
interface RobberyAction {
	type: "robbery",
	min_amount: number,
	max_amount: number
}
interface NoItemUseCommandAction {
	type: "no_item_use_command"
}
type Action = RoleAddAction | RobberyAction | NoItemUseCommandAction;
interface StoreItem {
	name: string,
	id: string,
	emoji?: `:${string}:` | `<:${string}:${number}>`,
	cost: number,
	description: string,
	category: string,
	response?: string,
	actions?: Action[]
}
const items: StoreItem[] = [
	{
		"name": "Banana",
		"id": "banana",
		"emoji": ":banana:",
		"cost": 7,
		"category": "food",
		"description": "Due to inflation, the price of a banana increased.",
		"response": "You eat the banana."
	},
	{
		"name": "Basic Robbing Knife",
		"id": "basic_robbing_knife",
		"emoji": ":knife:",
		"cost": 100,
		"category": "robbery",
		"description": "Steal money with this knife!",
		"actions": [
			{
				"type": "robbery",
				"min_amount": 25,
				"max_amount": 100
			},
			{
				"type": "no_item_use_command"
			}
		]
	},
	{
		"name": "Basic Robbing Kit",
		"id": "basic_robbing_kit",
		"emoji": ":knife:",
		"cost": 500,
		"category": "robbery",
		"description": "Rob more money with this kit!",
		"actions": [
			{
				"type": "robbery",
				"min_amount": 350,
				"max_amount": 800
			},
			{
				"type": "no_item_use_command"
			}
		]
	},
	{
		"name": "Silver Robbing Kit",
		"id": "silver_robbing_kit",
		"emoji": ":knife:",
		"cost": 500,
		"category": "robbery",
		"description": "Rob even more money with this kit!",
		"actions": [
			{
				"type": "robbery",
				"min_amount": 500,
				"max_amount": 1500
			},
			{
				"type": "no_item_use_command"
			}
		]
	},
	{
		"name": "Gold Role",
		"id": "gold_role",
		"emoji": ":sparkles:",
		"cost": 2000,
		"category": "roles",
		"description": "The gold has been missing ever since September 2023.",
		"actions": [
			{
				"type": "role_add",
				"guild": "1216816878937313442",
				"role": "1216817077336412162"
			}
		],
		"response": "You applied the gold role."
	},
	{
		"name": "Gold Robbing Kit",
		"id": "gold_robbing_kit",
		"emoji": ":knife:",
		"cost": 3500,
		"category": "robbery",
		"description": "Rob gold-level amounts with this kit!",
		"actions": [
			{
				"type": "robbery",
				"min_amount": 2500,
				"max_amount": 5000
			},
			{
				"type": "no_item_use_command"
			}
		]
	},
	{
		"name": "Diamond Role",
		"id": "diamond_role",
		"emoji": ":gem:",
		"cost": 20000,
		"category": "roles",
		"description": "There are too many zeros in a sextillion!",
		"actions": [
			{
				"type": "role_add",
				"guild": "1216816878937313442",
				"role": "1216817068238831738"
			}
		],
		"response": "You applied the diamond role."
	},
	{
		"name": "Diamond Robbing Kit",
		"id": "diamond_robbing_kit",
		"emoji": ":knife:",
		"cost": 3500,
		"category": "robbery",
		"description": "Rob diamond-level amounts with this kit!",
		"actions": [
			{
				"type": "robbery",
				"min_amount": 20000,
				"max_amount": 40000
			},
			{
				"type": "no_item_use_command"
			}
		]
	},
	{
		"name": "Popcorn",
		"id": "popcorn",
		"emoji": ":popcorn:",
		"cost": 100000,
		"category": "food",
		"description": "Who took most of the popcorn?",
		"response": "You eat the popcorn."
	}
]
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName !== "store") return;
	return await interaction.reply({
		embeds: [
			{
				title: "Store",
				fields: items.map(item => ({
					"name": "<:Gray_MJK_icon:1301689133885947976> " + item.cost.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " Mijovian crowns - " + (item.emoji ? item.emoji + " " : "") + item.name,
					"value": item.description
				}))
			}
		]
	})
})
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName !== "purchase") return;
	const itemId = interaction.options.getString("item")!
	const itemData = items.find(item => item.id === itemId)!
	const cardId = interaction.options.getString("card")
	if (cardId) {
		if (!(interaction.user.id in data.cards)) return await interaction.reply("No data.")
		if (!data.cards.includes(cardId)) return await interaction.reply("You don't own that card!")
		if (!(interaction.user.id in data.bankAmounts)) return await interaction.reply("No data.")
		if (data.bankAmounts[interaction.user.id] < itemData.cost) return await interaction.reply("You can't afford that! Please note that cashback comes after purchasing and not before, and that the money comes from your bank account.")
		data.bankAmounts[interaction.user.id] -= itemData.cost
		const cardData = cards.find(card => card.id === cardId)!
		if (itemData.category in cardData.cashback) data.bankAmounts[interaction.user.id] += itemData.cost * cardData.cashback[itemData.category]
	} else {
		if (!(interaction.user.id in data.wallets)) return await interaction.reply("No data.")
		if (data.wallets[interaction.user.id] < itemData.cost) return await interaction.reply("You can't afford that!")
		data.wallets[interaction.user.id] -= itemData.cost
	}
	data.inventory[interaction.user.id] ??= {}
	data.inventory[interaction.user.id][itemId] ??= 0;
	data.inventory[interaction.user.id][itemId] += 1;
	await saveData()
	await interaction.reply("Purchased item.")
})
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName !== "inventory") return;
	if (!(interaction.user.id in data.inventory)) return await interaction.reply("No data.")
	return await interaction.reply({
		embeds: [
			{
				title: "Inventory",
				fields: Object.entries(data.inventory[interaction.user.id] as {
					[itemId: string]: number
				}).map(([itemId, itemCount]) => {
					const item = items.find(item => item.id === itemId)
					if (!item) return {
						"name": itemCount + "x " + "Unknown",
						"value": "Unknown item."
					}
					return {
					"name": itemCount + "x " + (item.emoji ? item.emoji + " " : "") + item.name,
					"value": item.description ?? "No description."
					}
				})
			}
		]
	})
})
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName !== "use_item") return;
	if (!(interaction.user.id in data.inventory)) return await interaction.reply("No data.")
	const itemId = interaction.options.getString("item")!
	const itemData = items.find(item => item.id === itemId)!
	if (!data.inventory[interaction.user.id][itemId] || data.inventory[interaction.user.id][itemId] === 0) return await interaction.reply("You don't own this item!")
	const roleAddAction = itemData.actions?.find(action => action.type === "role_add")
	if (roleAddAction) {
		const guild = await (await client.guilds.fetch(roleAddAction.guild))
		const member = await guild.members.fetch(interaction.user)
		const role = await guild.roles.fetch(roleAddAction.role)
		if (!member) return await interaction.reply("You must join the guild.")
		if (!role) return await interaction.reply("No role found?")
		if (role.comparePositionTo(guild.members.me!.roles.highest) > 1) return await interaction.reply("Role hierarchy issue?")
		if (!guild.members.me!.permissions.has(PermissionsBitField.Flags.ManageRoles)) return await interaction.reply("Bot has no perms?")
		await member.roles.add(role)
	}
	const noItemUseCommandAction= itemData.actions?.find(action => action.type === "no_item_use_command")
	if (noItemUseCommandAction) {
		return await interaction.reply("You cannot perform that command on this item.")
	}
	data.inventory[interaction.user.id][itemId] -= 1;
	if (data.inventory[interaction.user.id][itemId] < 1) delete data.inventory[interaction.user.id][itemId]
	await saveData()
	switch (itemId) {
		case "banana":
			return await interaction.reply("You eat the banana.")
		case "gold_role":
			return await interaction.reply("You applied the gold role.")
		case "diamond_role":
			return await interaction.reply("You applied the diamond role.")
		case "popcorn":
			return await interaction.reply("You eat the popcorn.")
		default:
			data.inventory[interaction.user.id][itemId] ??= 0
			data.inventory[interaction.user.id][itemId] += 1;
			return await interaction.reply("Nothing happens. Your item should be readded to your inventory.")
	}
})
client.on(Events.InteractionCreate, async interaction => {
	let page = 0;
	if (interaction.isChatInputCommand()) {
		if (interaction.commandName !== "leaderboard") return;
	} else if (interaction.isButton()) {
		if (!interaction.customId.startsWith("leaderboard.")) return;
		page = +interaction.customId.split("leaderboard.pages.")[1]
	} else {
		return
	}
	const pageCount = Math.ceil(Object.keys(data.wallets).length / 10);
	const top = Object.entries(data.wallets as {[id: Snowflake]: number}).sort((a, b) => b[1] - a[1]).slice(page * 10, page * 10 + 10)
	const messageOptions: BaseMessageOptions = {
		components: pageCount > 1 ? [
			{
				"components": [
					page > 0 ? {
						"customId": "leaderboard.pages." + (page - 1),
						"emoji": "\u2B05",
						"label": "Previous Page",
						"style": ButtonStyle.Primary,
						"type": ComponentType.Button
					} : null,
					(page + 1) < pageCount ? {
						"customId": "leaderboard.pages." + (page + 1),
						"emoji": "\u27A1",
						"label": "Next Page",
						"style": ButtonStyle.Primary,
						"type": ComponentType.Button
					} : null
				].filter(component => component) as unknown as APIMessageActionRowComponent[],
				"type": ComponentType.ActionRow
			}
		] : [],
		embeds: [
			{
				title: "Leaderboard",
				description: top.map(([userId, balance], index) => "**" + index + 1 + ". " + "<@" + userId + ">** \u2022 <:Gray_MJK_icon:1301689133885947976>" + balance + " Mijovian crowns").join("\n\n"),
				footer: {
					"text": "Page " + (page + 1) + "/" + pageCount
				}
			}
		]
	}
	if (interaction.isChatInputCommand()) {
		await interaction.reply(messageOptions)
	} else {
		await interaction.update(messageOptions)
	}
})
const isBankClosed = () => {
	const now = new Date()
	now.setUTCMinutes(0);
	return now.getUTCHours() % 6 !== 0
}
const showBankCloseMessage = async (interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction) => {
	const now = new Date()
	now.setUTCMinutes(0);
	const secondsOffset = (6 - (now.getUTCHours() % 6)) * 60 * 60
	const sixHours = 6 * 60 * 60
	const nextOpening = Math.floor(now.getTime() / 1000) + secondsOffset
	return await interaction.reply(`The bank is currently closed. It will reopen for an hour at these times:\n<t:${nextOpening}>\n<t:${nextOpening + sixHours}>\n<t:${nextOpening + 2 * sixHours}>\n<t:${nextOpening + 3 * sixHours}>`)
}
const debitCardRequirements: Record<Snowflake, string | null> = {
	"1216816878937313442": "1275814472925184130",
	"1196121505654915112": null,
	"1130954621561602258": null
}
const debitCardsDisallowed = (interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction) => {
	if (!(interaction.guildId! in debitCardRequirements)) return "You cannot get a debit card in this server."
	if (debitCardRequirements[interaction.guildId!] && !(interaction.member as GuildMember).roles.resolve(debitCardRequirements[interaction.guildId!]!)) return "You need the <@&" + debitCardRequirements[interaction.guildId!] + "> role."
	return null
}
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName !== "bank" && interaction.commandName !== "atm") return;
	//if (interaction.commandName === "bank" && isBankClosed()) return await showBankCloseMessage(interaction)
	const bankMessage = "Welcome to the bank! You currently have <:Gray_MJK_icon:1301689133885947976> " + (data.bankAmounts[interaction.user.id] ?? 0) + " in your account. What would you like to do?"
	const atmMessage = "Welcome to the ATM! All transactions ahve a 15% fee to support the infrastructure of Mijovia. You currently have <:Gray_MJK_icon:1301689133885947976> " + (data.bankAmounts[interaction.user.id] ?? 0) + " in your account. What would you like to do?"
	return await interaction.reply({
		content: interaction.commandName === "bank" ? bankMessage : atmMessage,
		components: [
			{
				"components": [
					{
						"customId": interaction.commandName.split(".")[0] + ".deposit",
						"emoji": "\u{1F4E5}",
						"label": "Deposit",
						"style": ButtonStyle.Primary,
						"type": ComponentType.Button
					},
					{
						"customId": interaction.commandName.split(".")[0] + ".withdraw",
						"emoji": "\u{1F4E4}",
						"label": "Withdraw",
						"style": ButtonStyle.Primary,
						"type": ComponentType.Button
					},
					{
						"customId": interaction.commandName.split(".")[0] + ".debit_card",
						"emoji": "\u{1F4B3}",
						"label": "Debit Cards",
						"style": ButtonStyle.Secondary,
						"type": ComponentType.Button
					}
				],
				"type": ComponentType.ActionRow
			}
		]
	})
})

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton()) return;
	if (interaction.customId.split(".")[0] !== "bank" && interaction.customId.split(".")[0] !== "atm") return;
	if (interaction.customId.split(".")[1] === "debit_card") return;
	if (interaction.customId.startsWith("bank") && isBankClosed()) return await showBankCloseMessage(interaction)
	return await interaction.showModal({
		"title": "What amount?",
		"customId": interaction.customId,
		"components": [
			{
				"type": ComponentType.ActionRow,
				"components": [
					{
						"type": ComponentType.TextInput,
						"customId": "amount",
						"label": "Amount",
						"style": TextInputStyle.Short,
						"required": true
					}
				]
			}
		]
	})
})
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isModalSubmit()) return;
	if (interaction.customId.split(".")[0] !== "bank" && interaction.customId.split(".")[0] !== "atm") return;
	if (interaction.customId.startsWith("bank") && isBankClosed()) return await showBankCloseMessage(interaction)
	const amount = +interaction.fields.getTextInputValue("amount")
	if (Number.isNaN(amount) || +amount < 1 || +amount % 1 !== 0) return await interaction.reply("Amount must be an integer.")
	const isATM = interaction.customId.startsWith("atm")
	const gainAmount = Math.ceil(isATM ? amount * 0.85 : amount)
	if (interaction.customId.split(".")[1] === "deposit") {
		if (!(interaction.user.id in data.wallets)) return await interaction.reply("No data.")
		if (data.wallets[interaction.user.id] < amount) return await interaction.reply("You don't have that much money!")
		data.bankAmounts[interaction.user.id] ??= 0
		data.bankAmounts[interaction.user.id] += gainAmount
		data.wallets[interaction.user.id] -= amount
		await interaction.reply("Deposited <:Gray_MJK_icon:1301689133885947976> " + amount + " Mijovian crowns" + (isATM ? " with a 15% fee, with " + (amount - gainAmount) + " being taken away." : ""))
	} else {
		if (!(interaction.user.id in data.bankAmounts)) return await interaction.reply("No data.")
		data.bankAmounts[interaction.user.id] -= amount
		data.wallets[interaction.user.id] ??= 0
		data.wallets[interaction.user.id] += gainAmount
		await interaction.reply("Withdrew <:Gray_MJK_icon:1301689133885947976> " + amount + " Mijovian crowns" + (isATM ? " with a 15% fee, with " + (amount - gainAmount) + " being taken away." : ""))
	}
	await saveData()
})
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton()) return;
	if (interaction.customId !== "bank.debit_card" && interaction.customId !== "atm.debit_card") return;
	//if (interaction.customId.startsWith("bank") && isBankClosed()) return await showBankCloseMessage(interaction)
	const userCards = data.cards[interaction.user.id]
	return await interaction.reply({
		embeds: [
			userCards ? {
				"title": "Card List",
				"fields": userCards.map((userCard: string) => cards.find(card => userCard === card.id)).map((card: DebitCard) => ({
					"name": card.name,
					"value": card.description
				}))
			} : {
				"title": "Card List",
				"description": debitCardsDisallowed(interaction) ?? "You have no cards."
			}
		],
		components: [
			{
				"components": [
					{
						"customId": "bank.debit_card.get",
						"emoji": "\u{1F4B3}",
						"label": "Get a Debit Card",
						"style": ButtonStyle.Secondary,
						"type": ComponentType.Button,
						"disabled": interaction.customId.startsWith("atm") || !!debitCardsDisallowed(interaction)
					}
				],
				"type": ComponentType.ActionRow
			}
		]
	})
})

interface DebitCard {
	id: string,
	guild: Snowflake,
	name: string,
	description: string,
	cashback: Record<string, number>
}

const cards: DebitCard[] = [
	{
		"id": "boudroholm_basic_card",
		"guild": "1216816878937313442",
		"name": "Boudroholm Basic Card",
		"description": "This is a basic card for anyone to get.",
		"cashback": {}
	},
	{
		"id": "filipburg_flipping_card",
		"guild": "1196121505654915112",
		"name": "Filipburg Flipping Card",
		"description": "Are you a resident of Filipburg? If so, get the Filipburg Flipping card which will flip your debts away through the 5% cashback on roles - and maybe something more sinister, robbing kits!",
		"cashback": {
			"roles": 0.05,
			"robbing": 0.05
		}
	},
	{
		"id": "savannia_fun_card",
		"guild": "1130954621561602258",
		"name": "Savannia Fun Card",
		"description": "A card exclusively for VWOT! Includes 15% cashback on roles, food, and robbing!",
		"cashback": {
			"roles": 0.15,
			"food": 0.15,
			"robbing": 0.15
		}
	},
]
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton()) return;
	if (interaction.customId !== "bank.debit_card.get") return;
	//if (interaction.customId.startsWith("bank") && isBankClosed()) return await showBankCloseMessage(interaction)
	if (debitCardsDisallowed(interaction)) return await interaction.reply({
		content: debitCardsDisallowed(interaction)!,
		allowedMentions: {
			roles: []
		}
	})
	const userCards = data.cards[interaction.user.id]
	const availableCards = cards.filter((card: DebitCard) => card.guild === interaction.guildId)
	if (availableCards.length === 0) return await interaction.reply("There are no cards for this server.")
	return await interaction.reply({
		content: "Which of these cards would you like?",
		embeds: [
			{
				"title": "Card List",
				"fields": availableCards.map((card: DebitCard) => ({
					"name": card.name,
					"value": card.description
				}))
			}
		],
		components: [
			{
				"components": availableCards.map((card: DebitCard) => ({
					"customId": "bank.debit_card.get." + card.id,
					"label": card.name,
					"style": ButtonStyle.Secondary,
					"type": ComponentType.Button,
					"disabled": userCards ? userCards.includes(card.id) : false
				})),
				"type": ComponentType.ActionRow
			}
		]
	})
})

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton()) return;
	if (!interaction.customId.startsWith("bank.debit_card.get.")) return;
	//if (interaction.customId.startsWith("bank") && isBankClosed()) return await showBankCloseMessage(interaction)
	if (debitCardsDisallowed(interaction)) return await interaction.reply({
		content: debitCardsDisallowed(interaction)!,
		allowedMentions: {
			roles: []
		}
	})
	const userCards = data.cards[interaction.user.id]
	const cardId = interaction.customId.split("bank.debit_card.get.")[1]
	if (userCards && userCards.includes(cardId)) return await interaction.reply("You already have this card!")
	data.cards[interaction.user.id] ??= []
	data.cards[interaction.user.id].push(cardId)
	await saveData()
	return await interaction.reply("Obtained card.")
})

const commands = [
	new SlashCommandBuilder()
	.setName("daily")
	.setDescription("Collect your daily message rewards."),
	new SlashCommandBuilder()
	.setName("wallet")
	.setDescription("View the amount of money in your wallet.")
	.addUserOption(
		new SlashCommandUserOption()
		.setName("user")
		.setDescription("The user to check the wallet of.")
	),
	new SlashCommandBuilder()
	.setName("rob")
	.setDescription("Rob someone.")
	.addUserOption(
		new SlashCommandUserOption()
		.setName("user")
		.setDescription("The user to rob.")
		.setRequired(true)
	)
	.addStringOption(
		new SlashCommandStringOption()
		.setName("item")
		.setDescription("The item to use to rob.")
		.setRequired(true)
		.setChoices(items.filter(item => item.actions?.find(action => action.type === "robbery")).map(item => ({
			"name": item.name,
			"value": item.id
		})))
	),
	new SlashCommandBuilder()
	.setName("give_money")
	.setDescription("Give someone money from your wallet.")
	.addIntegerOption(
		new SlashCommandIntegerOption()
		.setName("amount")
		.setDescription("The amount of money to give.")
		.setRequired(true)
	)
	.addUserOption(
		new SlashCommandUserOption()
		.setName("user")
		.setDescription("The user to give your money to.")
		.setRequired(true)
	),
	new SlashCommandBuilder()
	.setName("store")
	.setDescription("View the store."),
	new SlashCommandBuilder()
	.setName("purchase")
	.setDescription("Purchase an item in the store")
	.addStringOption(
		new SlashCommandStringOption()
		.setName("item")
		.setDescription("The item to purchase.")
		.setRequired(true)
		.setChoices(items.map(item => ({
			"name": item.name,
			"value": item.id
		})))
	)
	.addStringOption(
		new SlashCommandStringOption()
		.setName("card")
		.setDescription("The debit card to use.")
		.setChoices(cards.map(card => ({
			"name": card.name,
			"value": card.id
		})))
	),
	new SlashCommandBuilder()
	.setName("inventory")
	.setDescription("View your inventory."),
	new SlashCommandBuilder()
	.setName("use_item")
	.setDescription("Use an item in your inventory.")
	.addStringOption(
		new SlashCommandStringOption()
		.setName("item")
		.setDescription("The item to use.")
		.setRequired(true)
		.setChoices(items.map(item => ({
			"name": item.name,
			"value": item.id
		})))
	),
	new SlashCommandBuilder()
	.setName("leaderboard")
	.setDescription("View the wallet leaderboard."),
	new SlashCommandBuilder()
	.setName("bank")
	.setDescription("Deposit and withdraw money here."),
	new SlashCommandBuilder()
	.setName("atm")
	.setDescription("Access your bank money anytime but with a fee."),
]
await client.rest.put(Routes.applicationCommands(client.application!.id), {"body": commands})