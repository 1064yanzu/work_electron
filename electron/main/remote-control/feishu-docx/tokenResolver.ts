import * as Lark from "@larksuiteoapi/node-sdk";

export type WikiResolvedDocx = {
	wiki_token: string;
	obj_type?: string;
	document_id?: string;
	title?: string;
	raw?: unknown;
};

export async function resolveWikiTokenToDocx(
	client: Lark.Client,
	wikiToken: string,
): Promise<WikiResolvedDocx> {
	const token = String(wikiToken || "").trim();
	if (!token) {
		throw new Error("wiki token 不能为空");
	}
	const response = await client.wiki.v2.space.getNode({
		params: { token },
	});
	const node = response.data?.node;
	return {
		wiki_token: token,
		obj_type: node?.obj_type,
		document_id: node?.obj_token,
		title: node?.title,
		raw: response,
	};
}
