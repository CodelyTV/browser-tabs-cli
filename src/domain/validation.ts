import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../../tab-batch-schema/schema.json";
import { type Color, colors } from "./browser.js";
import type { Plan } from "./plan.js";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const matchesSchema = ajv.compile<Plan>(schema);
export function parsePlan(value: unknown): Plan {
	if (!matchesSchema(value))
		throw new Error(
			`Invalid batch: ${ajv.errorsText(matchesSchema.errors, { separator: "; " })}`,
		);
	unique(
		value.tabs.map((tab) => tab.key),
		"tab keys",
	);
	unique(
		value.groups.map((group) => group.key),
		"group keys",
	);
	const groups = new Set(value.groups.map((group) => group.key));
	for (const tab of value.tabs) {
		navigationUrl(tab.url);
		if (tab.groupKey && !groups.has(tab.groupKey))
			throw new Error(`Unknown group key: ${tab.groupKey}.`);
	}
	for (const group of value.groups)
		if (!value.tabs.some((tab) => tab.groupKey === group.key))
			throw new Error(`Empty group: ${group.key}.`);
	return value;
}
function unique(values: (string | number)[], label: string) {
	if (new Set(values).size !== values.length)
		throw new Error(`Duplicate ${label}.`);
}
export function text(value: string | undefined, label: string): string {
	if (!value?.trim()) throw new Error(`Missing ${label}.`);
	return value;
}
export function id(value: string): number {
	if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
		throw new Error(`Invalid ID: ${value}.`);
	return Number(value);
}
export function tabId(value: string): number | string {
	if (/^cdp:[a-zA-Z0-9_-]+$/.test(value)) return value;
	return id(value);
}
export function ids(value: string | undefined): (number | string)[] {
	const result = text(value, "--tabs").split(",").map(tabId);
	unique(result, "tab IDs");
	return result;
}
export function color(value: string | undefined): Color | undefined {
	if (value === undefined) return undefined;
	if (!colors.includes(value as Color))
		throw new Error(`Unknown color: ${value}.`);
	return value as Color;
}
export function navigationUrl(value: string): string {
	const url = new URL(value);
	if (["javascript:", "vbscript:", "data:"].includes(url.protocol))
		throw new Error("Script and data URLs are not supported.");
	return value;
}
