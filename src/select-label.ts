import { db } from "./database"
import prompts from "prompts"

export async function getLabels() {
    const all = await db.selectFrom('Label')
        .where('Label.enabled', '=', true)
        .where('Label.credentials', 'is not', null)
        .orderBy('Label.created', 'desc')
        .select(['Label.id', 'Label.displayName', 'Label.credentials', 'Label.endpoint', 'Label.whatsappAccountId'])
        .execute()

    const selected = await prompts({
        type: 'autocompleteMultiselect',
        name: 'labelId',
        message: 'Pick Labels where you want to register the template',
        hint: '- Space to select. Return to submit',
        choices: all.map(lbl => ({
            title: `${lbl.id}: ${lbl.displayName}`,
            value: lbl,
        }))
    })

    return selected.labelId as typeof all
}

export type Label = Awaited<ReturnType<typeof getLabels>>[0]