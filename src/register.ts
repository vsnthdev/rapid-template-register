import type { Label } from './select-label'

export async function register(label: Label, template: any) {
    const endpoint = label.endpoint.split('/').slice(0, -1).join('/').concat(`/${label.whatsappAccountId}/message_templates`)

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${label.credentials}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(template)
    })

    const json: any = await res.json()

    // if error occurred, return it
    if (json.error) {
        console.log(`❌ API Error:`, json.error)
        return { error: json.error }
    }

    // if marketing category, delete and return info
    if (json.category == 'MARKETING') {
        const deleteRes = await fetch(`${endpoint}?name=${template.name}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${label.credentials}`,
            },
        })

        const deleteJson: any = await deleteRes.json()
        console.log(`🗑️ Deleted MARKETING template:`, deleteRes.status, deleteRes.statusText, deleteJson.success)
        
        return {
            category: 'MARKETING',
            deleted: true,
            name: template.name
        }
    }

    // return the full response
    console.log(`📋 Registration response:`, json)
    return json
}