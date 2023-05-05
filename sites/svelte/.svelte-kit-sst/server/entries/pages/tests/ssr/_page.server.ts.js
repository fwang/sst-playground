import crypto, { createHash, createHmac } from "crypto";
import { Buffer as Buffer$1 } from "buffer";
import { homedir, platform, release } from "os";
import { sep, join } from "path";
import { promises, lstatSync, fstatSync, readFileSync } from "fs";
import { parse } from "url";
import { request, Agent } from "http";
import { exec } from "child_process";
import { promisify } from "util";
import { Agent as Agent$1, request as request$1 } from "https";
import { Readable, Writable } from "stream";
import "http2";
import { versions, env } from "process";
import { F as FUNCTION_NAME } from "../../../../chunks/private.js";
const resolveParamsForS3 = async (endpointParams) => {
  const bucket = endpointParams?.Bucket || "";
  if (typeof endpointParams.Bucket === "string") {
    endpointParams.Bucket = bucket.replace(/#/g, encodeURIComponent("#")).replace(/\?/g, encodeURIComponent("?"));
  }
  if (isArnBucketName(bucket)) {
    if (endpointParams.ForcePathStyle === true) {
      throw new Error("Path-style addressing cannot be used with ARN buckets");
    }
  } else if (!isDnsCompatibleBucketName(bucket) || bucket.indexOf(".") !== -1 && !String(endpointParams.Endpoint).startsWith("http:") || bucket.toLowerCase() !== bucket || bucket.length < 3) {
    endpointParams.ForcePathStyle = true;
  }
  if (endpointParams.DisableMultiRegionAccessPoints) {
    endpointParams.disableMultiRegionAccessPoints = true;
    endpointParams.DisableMRAP = true;
  }
  return endpointParams;
};
const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9\.\-]{1,61}[a-z0-9]$/;
const IP_ADDRESS_PATTERN = /(\d+\.){3}\d+/;
const DOTS_PATTERN = /\.\./;
const isDnsCompatibleBucketName = (bucketName) => DOMAIN_PATTERN.test(bucketName) && !IP_ADDRESS_PATTERN.test(bucketName) && !DOTS_PATTERN.test(bucketName);
const isArnBucketName = (bucketName) => {
  const [arn, partition2, service, region, account, typeOrId] = bucketName.split(":");
  const isArn = arn === "arn" && bucketName.split(":").length >= 6;
  const isValidArn = [arn, partition2, service, account, typeOrId].filter(Boolean).length === 5;
  if (isArn && !isValidArn) {
    throw new Error(`Invalid ARN: ${bucketName} was an invalid ARN.`);
  }
  return arn === "arn" && !!partition2 && !!service && !!account && !!typeOrId;
};
const createConfigValueProvider = (configKey, canonicalEndpointParamKey, config) => {
  const configProvider = async () => {
    const configValue = config[configKey] ?? config[canonicalEndpointParamKey];
    if (typeof configValue === "function") {
      return configValue();
    }
    return configValue;
  };
  if (configKey === "endpoint" || canonicalEndpointParamKey === "endpoint") {
    return async () => {
      const endpoint = await configProvider();
      if (endpoint && typeof endpoint === "object") {
        if ("url" in endpoint) {
          return endpoint.url.href;
        }
        if ("hostname" in endpoint) {
          const { protocol, hostname, port, path } = endpoint;
          return `${protocol}//${hostname}${port ? ":" + port : ""}${path}`;
        }
      }
      return endpoint;
    };
  }
  return configProvider;
};
const getEndpointFromInstructions = async (commandInput, instructionsSupplier, clientConfig, context) => {
  const endpointParams = await resolveParams(commandInput, instructionsSupplier, clientConfig);
  if (typeof clientConfig.endpointProvider !== "function") {
    throw new Error("config.endpointProvider is not set.");
  }
  const endpoint = clientConfig.endpointProvider(endpointParams, context);
  return endpoint;
};
const resolveParams = async (commandInput, instructionsSupplier, clientConfig) => {
  const endpointParams = {};
  const instructions = instructionsSupplier?.getEndpointParameterInstructions?.() || {};
  for (const [name2, instruction] of Object.entries(instructions)) {
    switch (instruction.type) {
      case "staticContextParams":
        endpointParams[name2] = instruction.value;
        break;
      case "contextParams":
        endpointParams[name2] = commandInput[instruction.name];
        break;
      case "clientContextParams":
      case "builtInParams":
        endpointParams[name2] = await createConfigValueProvider(instruction.name, name2, clientConfig)();
        break;
      default:
        throw new Error("Unrecognized endpoint parameter instruction: " + JSON.stringify(instruction));
    }
  }
  if (Object.keys(instructions).length === 0) {
    Object.assign(endpointParams, clientConfig);
  }
  if (String(clientConfig.serviceId).toLowerCase() === "s3") {
    await resolveParamsForS3(endpointParams);
  }
  return endpointParams;
};
function parseQueryString(querystring) {
  const query = {};
  querystring = querystring.replace(/^\?/, "");
  if (querystring) {
    for (const pair of querystring.split("&")) {
      let [key, value = null] = pair.split("=");
      key = decodeURIComponent(key);
      if (value) {
        value = decodeURIComponent(value);
      }
      if (!(key in query)) {
        query[key] = value;
      } else if (Array.isArray(query[key])) {
        query[key].push(value);
      } else {
        query[key] = [query[key], value];
      }
    }
  }
  return query;
}
const parseUrl = (url) => {
  if (typeof url === "string") {
    return parseUrl(new URL(url));
  }
  const { hostname, pathname, port, protocol, search } = url;
  let query;
  if (search) {
    query = parseQueryString(search);
  }
  return {
    hostname,
    port: port ? parseInt(port) : void 0,
    protocol,
    path: pathname,
    query
  };
};
const toEndpointV1 = (endpoint) => {
  if (typeof endpoint === "object") {
    if ("url" in endpoint) {
      return parseUrl(endpoint.url);
    }
    return endpoint;
  }
  return parseUrl(endpoint);
};
const endpointMiddleware = ({ config, instructions }) => {
  return (next, context) => async (args) => {
    const endpoint = await getEndpointFromInstructions(args.input, {
      getEndpointParameterInstructions() {
        return instructions;
      }
    }, { ...config }, context);
    context.endpointV2 = endpoint;
    context.authSchemes = endpoint.properties?.authSchemes;
    const authScheme = context.authSchemes?.[0];
    if (authScheme) {
      context["signing_region"] = authScheme.signingRegion;
      context["signing_service"] = authScheme.signingName;
    }
    return next({
      ...args
    });
  };
};
const deserializerMiddleware = (options, deserializer) => (next, context) => async (args) => {
  const { response } = await next(args);
  try {
    const parsed = await deserializer(response, options);
    return {
      response,
      output: parsed
    };
  } catch (error) {
    Object.defineProperty(error, "$response", {
      value: response
    });
    throw error;
  }
};
const serializerMiddleware = (options, serializer) => (next, context) => async (args) => {
  const endpoint = context.endpointV2?.url && options.urlParser ? async () => options.urlParser(context.endpointV2.url) : options.endpoint;
  if (!endpoint) {
    throw new Error("No valid endpoint provider available.");
  }
  const request2 = await serializer(args.input, { ...options, endpoint });
  return next({
    ...args,
    request: request2
  });
};
const deserializerMiddlewareOption = {
  name: "deserializerMiddleware",
  step: "deserialize",
  tags: ["DESERIALIZER"],
  override: true
};
const serializerMiddlewareOption = {
  name: "serializerMiddleware",
  step: "serialize",
  tags: ["SERIALIZER"],
  override: true
};
function getSerdePlugin(config, serializer, deserializer) {
  return {
    applyToStack: (commandStack) => {
      commandStack.add(deserializerMiddleware(config, deserializer), deserializerMiddlewareOption);
      commandStack.add(serializerMiddleware(config, serializer), serializerMiddlewareOption);
    }
  };
}
const endpointMiddlewareOptions = {
  step: "serialize",
  tags: ["ENDPOINT_PARAMETERS", "ENDPOINT_V2", "ENDPOINT"],
  name: "endpointV2Middleware",
  override: true,
  relation: "before",
  toMiddleware: serializerMiddlewareOption.name
};
const getEndpointPlugin = (config, instructions) => ({
  applyToStack: (clientStack) => {
    clientStack.addRelativeTo(endpointMiddleware({
      config,
      instructions
    }), endpointMiddlewareOptions);
  }
});
const normalizeProvider = (input) => {
  if (typeof input === "function")
    return input;
  const promisified = Promise.resolve(input);
  return () => promisified;
};
const resolveEndpointConfig = (input) => {
  const tls = input.tls ?? true;
  const { endpoint } = input;
  const customEndpointProvider = endpoint != null ? async () => toEndpointV1(await normalizeProvider(endpoint)()) : void 0;
  const isCustomEndpoint = !!endpoint;
  return {
    ...input,
    endpoint: customEndpointProvider,
    tls,
    isCustomEndpoint,
    useDualstackEndpoint: normalizeProvider(input.useDualstackEndpoint ?? false),
    useFipsEndpoint: normalizeProvider(input.useFipsEndpoint ?? false)
  };
};
class NoOpLogger {
  trace() {
  }
  debug() {
  }
  info() {
  }
  warn() {
  }
  error() {
  }
}
const constructStack = () => {
  let absoluteEntries = [];
  let relativeEntries = [];
  const entriesNameSet = /* @__PURE__ */ new Set();
  const sort = (entries) => entries.sort((a2, b2) => stepWeights[b2.step] - stepWeights[a2.step] || priorityWeights[b2.priority || "normal"] - priorityWeights[a2.priority || "normal"]);
  const removeByName = (toRemove) => {
    let isRemoved = false;
    const filterCb = (entry) => {
      if (entry.name && entry.name === toRemove) {
        isRemoved = true;
        entriesNameSet.delete(toRemove);
        return false;
      }
      return true;
    };
    absoluteEntries = absoluteEntries.filter(filterCb);
    relativeEntries = relativeEntries.filter(filterCb);
    return isRemoved;
  };
  const removeByReference = (toRemove) => {
    let isRemoved = false;
    const filterCb = (entry) => {
      if (entry.middleware === toRemove) {
        isRemoved = true;
        if (entry.name)
          entriesNameSet.delete(entry.name);
        return false;
      }
      return true;
    };
    absoluteEntries = absoluteEntries.filter(filterCb);
    relativeEntries = relativeEntries.filter(filterCb);
    return isRemoved;
  };
  const cloneTo = (toStack) => {
    absoluteEntries.forEach((entry) => {
      toStack.add(entry.middleware, { ...entry });
    });
    relativeEntries.forEach((entry) => {
      toStack.addRelativeTo(entry.middleware, { ...entry });
    });
    return toStack;
  };
  const expandRelativeMiddlewareList = (from) => {
    const expandedMiddlewareList = [];
    from.before.forEach((entry) => {
      if (entry.before.length === 0 && entry.after.length === 0) {
        expandedMiddlewareList.push(entry);
      } else {
        expandedMiddlewareList.push(...expandRelativeMiddlewareList(entry));
      }
    });
    expandedMiddlewareList.push(from);
    from.after.reverse().forEach((entry) => {
      if (entry.before.length === 0 && entry.after.length === 0) {
        expandedMiddlewareList.push(entry);
      } else {
        expandedMiddlewareList.push(...expandRelativeMiddlewareList(entry));
      }
    });
    return expandedMiddlewareList;
  };
  const getMiddlewareList = (debug = false) => {
    const normalizedAbsoluteEntries = [];
    const normalizedRelativeEntries = [];
    const normalizedEntriesNameMap = {};
    absoluteEntries.forEach((entry) => {
      const normalizedEntry = {
        ...entry,
        before: [],
        after: []
      };
      if (normalizedEntry.name)
        normalizedEntriesNameMap[normalizedEntry.name] = normalizedEntry;
      normalizedAbsoluteEntries.push(normalizedEntry);
    });
    relativeEntries.forEach((entry) => {
      const normalizedEntry = {
        ...entry,
        before: [],
        after: []
      };
      if (normalizedEntry.name)
        normalizedEntriesNameMap[normalizedEntry.name] = normalizedEntry;
      normalizedRelativeEntries.push(normalizedEntry);
    });
    normalizedRelativeEntries.forEach((entry) => {
      if (entry.toMiddleware) {
        const toMiddleware = normalizedEntriesNameMap[entry.toMiddleware];
        if (toMiddleware === void 0) {
          if (debug) {
            return;
          }
          throw new Error(`${entry.toMiddleware} is not found when adding ${entry.name || "anonymous"} middleware ${entry.relation} ${entry.toMiddleware}`);
        }
        if (entry.relation === "after") {
          toMiddleware.after.push(entry);
        }
        if (entry.relation === "before") {
          toMiddleware.before.push(entry);
        }
      }
    });
    const mainChain = sort(normalizedAbsoluteEntries).map(expandRelativeMiddlewareList).reduce((wholeList, expendedMiddlewareList) => {
      wholeList.push(...expendedMiddlewareList);
      return wholeList;
    }, []);
    return mainChain;
  };
  const stack = {
    add: (middleware, options = {}) => {
      const { name: name2, override } = options;
      const entry = {
        step: "initialize",
        priority: "normal",
        middleware,
        ...options
      };
      if (name2) {
        if (entriesNameSet.has(name2)) {
          if (!override)
            throw new Error(`Duplicate middleware name '${name2}'`);
          const toOverrideIndex = absoluteEntries.findIndex((entry2) => entry2.name === name2);
          const toOverride = absoluteEntries[toOverrideIndex];
          if (toOverride.step !== entry.step || toOverride.priority !== entry.priority) {
            throw new Error(`"${name2}" middleware with ${toOverride.priority} priority in ${toOverride.step} step cannot be overridden by same-name middleware with ${entry.priority} priority in ${entry.step} step.`);
          }
          absoluteEntries.splice(toOverrideIndex, 1);
        }
        entriesNameSet.add(name2);
      }
      absoluteEntries.push(entry);
    },
    addRelativeTo: (middleware, options) => {
      const { name: name2, override } = options;
      const entry = {
        middleware,
        ...options
      };
      if (name2) {
        if (entriesNameSet.has(name2)) {
          if (!override)
            throw new Error(`Duplicate middleware name '${name2}'`);
          const toOverrideIndex = relativeEntries.findIndex((entry2) => entry2.name === name2);
          const toOverride = relativeEntries[toOverrideIndex];
          if (toOverride.toMiddleware !== entry.toMiddleware || toOverride.relation !== entry.relation) {
            throw new Error(`"${name2}" middleware ${toOverride.relation} "${toOverride.toMiddleware}" middleware cannot be overridden by same-name middleware ${entry.relation} "${entry.toMiddleware}" middleware.`);
          }
          relativeEntries.splice(toOverrideIndex, 1);
        }
        entriesNameSet.add(name2);
      }
      relativeEntries.push(entry);
    },
    clone: () => cloneTo(constructStack()),
    use: (plugin) => {
      plugin.applyToStack(stack);
    },
    remove: (toRemove) => {
      if (typeof toRemove === "string")
        return removeByName(toRemove);
      else
        return removeByReference(toRemove);
    },
    removeByTag: (toRemove) => {
      let isRemoved = false;
      const filterCb = (entry) => {
        const { tags, name: name2 } = entry;
        if (tags && tags.includes(toRemove)) {
          if (name2)
            entriesNameSet.delete(name2);
          isRemoved = true;
          return false;
        }
        return true;
      };
      absoluteEntries = absoluteEntries.filter(filterCb);
      relativeEntries = relativeEntries.filter(filterCb);
      return isRemoved;
    },
    concat: (from) => {
      const cloned = cloneTo(constructStack());
      cloned.use(from);
      return cloned;
    },
    applyToStack: cloneTo,
    identify: () => {
      return getMiddlewareList(true).map((mw) => {
        return mw.name + ": " + (mw.tags || []).join(",");
      });
    },
    resolve: (handler, context) => {
      for (const middleware of getMiddlewareList().map((entry) => entry.middleware).reverse()) {
        handler = middleware(handler, context);
      }
      return handler;
    }
  };
  return stack;
};
const stepWeights = {
  initialize: 5,
  serialize: 4,
  build: 3,
  finalizeRequest: 2,
  deserialize: 1
};
const priorityWeights = {
  high: 3,
  normal: 2,
  low: 1
};
class Client {
  constructor(config) {
    this.middlewareStack = constructStack();
    this.config = config;
  }
  send(command, optionsOrCb, cb) {
    const options = typeof optionsOrCb !== "function" ? optionsOrCb : void 0;
    const callback = typeof optionsOrCb === "function" ? optionsOrCb : cb;
    const handler = command.resolveMiddleware(this.middlewareStack, this.config, options);
    if (callback) {
      handler(command).then((result) => callback(null, result.output), (err) => callback(err)).catch(() => {
      });
    } else {
      return handler(command).then((result) => result.output);
    }
  }
  destroy() {
    if (this.config.requestHandler.destroy)
      this.config.requestHandler.destroy();
  }
}
class Command {
  constructor() {
    this.middlewareStack = constructStack();
  }
}
const SENSITIVE_STRING = "***SensitiveInformation***";
const expectNumber = (value) => {
  if (value === null || value === void 0) {
    return void 0;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) {
      if (String(parsed) !== String(value)) {
        logger.warn(stackTraceWarning(`Expected number but observed string: ${value}`));
      }
      return parsed;
    }
  }
  if (typeof value === "number") {
    return value;
  }
  throw new TypeError(`Expected number, got ${typeof value}: ${value}`);
};
const MAX_FLOAT = Math.ceil(2 ** 127 * (2 - 2 ** -23));
const expectFloat32 = (value) => {
  const expected = expectNumber(value);
  if (expected !== void 0 && !Number.isNaN(expected) && expected !== Infinity && expected !== -Infinity) {
    if (Math.abs(expected) > MAX_FLOAT) {
      throw new TypeError(`Expected 32-bit float, got ${value}`);
    }
  }
  return expected;
};
const expectLong = (value) => {
  if (value === null || value === void 0) {
    return void 0;
  }
  if (Number.isInteger(value) && !Number.isNaN(value)) {
    return value;
  }
  throw new TypeError(`Expected integer, got ${typeof value}: ${value}`);
};
const expectInt32 = (value) => expectSizedInt(value, 32);
const expectShort = (value) => expectSizedInt(value, 16);
const expectByte = (value) => expectSizedInt(value, 8);
const expectSizedInt = (value, size) => {
  const expected = expectLong(value);
  if (expected !== void 0 && castInt(expected, size) !== expected) {
    throw new TypeError(`Expected ${size}-bit integer, got ${value}`);
  }
  return expected;
};
const castInt = (value, size) => {
  switch (size) {
    case 32:
      return Int32Array.of(value)[0];
    case 16:
      return Int16Array.of(value)[0];
    case 8:
      return Int8Array.of(value)[0];
  }
};
const expectNonNull = (value, location) => {
  if (value === null || value === void 0) {
    if (location) {
      throw new TypeError(`Expected a non-null value for ${location}`);
    }
    throw new TypeError("Expected a non-null value");
  }
  return value;
};
const expectObject = (value) => {
  if (value === null || value === void 0) {
    return void 0;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  const receivedType = Array.isArray(value) ? "array" : typeof value;
  throw new TypeError(`Expected object, got ${receivedType}: ${value}`);
};
const expectString = (value) => {
  if (value === null || value === void 0) {
    return void 0;
  }
  if (typeof value === "string") {
    return value;
  }
  if (["boolean", "number", "bigint"].includes(typeof value)) {
    logger.warn(stackTraceWarning(`Expected string, got ${typeof value}: ${value}`));
    return String(value);
  }
  throw new TypeError(`Expected string, got ${typeof value}: ${value}`);
};
const strictParseDouble = (value) => {
  if (typeof value == "string") {
    return expectNumber(parseNumber(value));
  }
  return expectNumber(value);
};
const strictParseFloat32 = (value) => {
  if (typeof value == "string") {
    return expectFloat32(parseNumber(value));
  }
  return expectFloat32(value);
};
const NUMBER_REGEX = /(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|(-?Infinity)|(NaN)/g;
const parseNumber = (value) => {
  const matches = value.match(NUMBER_REGEX);
  if (matches === null || matches[0].length !== value.length) {
    throw new TypeError(`Expected real number, got implicit NaN`);
  }
  return parseFloat(value);
};
const strictParseInt32 = (value) => {
  if (typeof value === "string") {
    return expectInt32(parseNumber(value));
  }
  return expectInt32(value);
};
const strictParseShort = (value) => {
  if (typeof value === "string") {
    return expectShort(parseNumber(value));
  }
  return expectShort(value);
};
const strictParseByte = (value) => {
  if (typeof value === "string") {
    return expectByte(parseNumber(value));
  }
  return expectByte(value);
};
const stackTraceWarning = (message) => {
  return String(new TypeError(message).stack || message).split("\n").slice(0, 5).filter((s2) => !s2.includes("stackTraceWarning")).join("\n");
};
const logger = {
  warn: console.warn
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RFC3339_WITH_OFFSET = new RegExp(/^(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(([-+]\d{2}\:\d{2})|[zZ])$/);
const parseRfc3339DateTimeWithOffset = (value) => {
  if (value === null || value === void 0) {
    return void 0;
  }
  if (typeof value !== "string") {
    throw new TypeError("RFC-3339 date-times must be expressed as strings");
  }
  const match = RFC3339_WITH_OFFSET.exec(value);
  if (!match) {
    throw new TypeError("Invalid RFC-3339 date-time value");
  }
  const [_, yearStr, monthStr, dayStr, hours, minutes, seconds, fractionalMilliseconds, offsetStr] = match;
  const year = strictParseShort(stripLeadingZeroes(yearStr));
  const month = parseDateValue(monthStr, "month", 1, 12);
  const day = parseDateValue(dayStr, "day", 1, 31);
  const date = buildDate(year, month, day, { hours, minutes, seconds, fractionalMilliseconds });
  if (offsetStr.toUpperCase() != "Z") {
    date.setTime(date.getTime() - parseOffsetToMilliseconds(offsetStr));
  }
  return date;
};
const parseEpochTimestamp = (value) => {
  if (value === null || value === void 0) {
    return void 0;
  }
  let valueAsDouble;
  if (typeof value === "number") {
    valueAsDouble = value;
  } else if (typeof value === "string") {
    valueAsDouble = strictParseDouble(value);
  } else {
    throw new TypeError("Epoch timestamps must be expressed as floating point numbers or their string representation");
  }
  if (Number.isNaN(valueAsDouble) || valueAsDouble === Infinity || valueAsDouble === -Infinity) {
    throw new TypeError("Epoch timestamps must be valid, non-Infinite, non-NaN numerics");
  }
  return new Date(Math.round(valueAsDouble * 1e3));
};
const buildDate = (year, month, day, time) => {
  const adjustedMonth = month - 1;
  validateDayOfMonth(year, adjustedMonth, day);
  return new Date(Date.UTC(year, adjustedMonth, day, parseDateValue(time.hours, "hour", 0, 23), parseDateValue(time.minutes, "minute", 0, 59), parseDateValue(time.seconds, "seconds", 0, 60), parseMilliseconds(time.fractionalMilliseconds)));
};
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const validateDayOfMonth = (year, month, day) => {
  let maxDays = DAYS_IN_MONTH[month];
  if (month === 1 && isLeapYear(year)) {
    maxDays = 29;
  }
  if (day > maxDays) {
    throw new TypeError(`Invalid day for ${MONTHS[month]} in ${year}: ${day}`);
  }
};
const isLeapYear = (year) => {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
};
const parseDateValue = (value, type, lower, upper) => {
  const dateVal = strictParseByte(stripLeadingZeroes(value));
  if (dateVal < lower || dateVal > upper) {
    throw new TypeError(`${type} must be between ${lower} and ${upper}, inclusive`);
  }
  return dateVal;
};
const parseMilliseconds = (value) => {
  if (value === null || value === void 0) {
    return 0;
  }
  return strictParseFloat32("0." + value) * 1e3;
};
const parseOffsetToMilliseconds = (value) => {
  const directionStr = value[0];
  let direction = 1;
  if (directionStr == "+") {
    direction = 1;
  } else if (directionStr == "-") {
    direction = -1;
  } else {
    throw new TypeError(`Offset direction, ${directionStr}, must be "+" or "-"`);
  }
  const hour = Number(value.substring(1, 3));
  const minute = Number(value.substring(4, 6));
  return direction * (hour * 60 + minute) * 60 * 1e3;
};
const stripLeadingZeroes = (value) => {
  let idx = 0;
  while (idx < value.length - 1 && value.charAt(idx) === "0") {
    idx++;
  }
  if (idx === 0) {
    return value;
  }
  return value.slice(idx);
};
class ServiceException extends Error {
  constructor(options) {
    super(options.message);
    Object.setPrototypeOf(this, ServiceException.prototype);
    this.name = options.name;
    this.$fault = options.$fault;
    this.$metadata = options.$metadata;
  }
}
const decorateServiceException = (exception, additions = {}) => {
  Object.entries(additions).filter(([, v2]) => v2 !== void 0).forEach(([k2, v2]) => {
    if (exception[k2] == void 0 || exception[k2] === "") {
      exception[k2] = v2;
    }
  });
  const message = exception.message || exception.Message || "UnknownError";
  exception.message = message;
  delete exception.Message;
  return exception;
};
const throwDefaultError = ({ output, parsedBody, exceptionCtor, errorCode }) => {
  const $metadata = deserializeMetadata$4(output);
  const statusCode = $metadata.httpStatusCode ? $metadata.httpStatusCode + "" : void 0;
  const response = new exceptionCtor({
    name: parsedBody?.code || parsedBody?.Code || errorCode || statusCode || "UnknownError",
    $fault: "client",
    $metadata
  });
  throw decorateServiceException(response, parsedBody);
};
const deserializeMetadata$4 = (output) => ({
  httpStatusCode: output.statusCode,
  requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
  extendedRequestId: output.headers["x-amz-id-2"],
  cfId: output.headers["x-amz-cf-id"]
});
const loadConfigsForDefaultMode = (mode) => {
  switch (mode) {
    case "standard":
      return {
        retryMode: "standard",
        connectionTimeout: 3100
      };
    case "in-region":
      return {
        retryMode: "standard",
        connectionTimeout: 1100
      };
    case "cross-region":
      return {
        retryMode: "standard",
        connectionTimeout: 3100
      };
    case "mobile":
      return {
        retryMode: "standard",
        connectionTimeout: 3e4
      };
    default:
      return {};
  }
};
let warningEmitted = false;
const emitWarningIfUnsupportedVersion = (version2) => {
  if (version2 && !warningEmitted && parseInt(version2.substring(1, version2.indexOf("."))) < 14) {
    warningEmitted = true;
  }
};
function extendedEncodeURIComponent(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, function(c2) {
    return "%" + c2.charCodeAt(0).toString(16).toUpperCase();
  });
}
const getValueFromTextNode = (obj) => {
  const textNodeName = "#text";
  for (const key in obj) {
    if (obj.hasOwnProperty(key) && obj[key][textNodeName] !== void 0) {
      obj[key] = obj[key][textNodeName];
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      obj[key] = getValueFromTextNode(obj[key]);
    }
  }
  return obj;
};
const StringWrapper = function() {
  const Class = Object.getPrototypeOf(this).constructor;
  const Constructor = Function.bind.apply(String, [null, ...arguments]);
  const instance = new Constructor();
  Object.setPrototypeOf(instance, Class.prototype);
  return instance;
};
StringWrapper.prototype = Object.create(String.prototype, {
  constructor: {
    value: StringWrapper,
    enumerable: false,
    writable: true,
    configurable: true
  }
});
Object.setPrototypeOf(StringWrapper, String);
function map$2(arg0, arg1, arg2) {
  let target;
  let filter;
  let instructions;
  if (typeof arg1 === "undefined" && typeof arg2 === "undefined") {
    target = {};
    instructions = arg0;
  } else {
    target = arg0;
    if (typeof arg1 === "function") {
      filter = arg1;
      instructions = arg2;
      return mapWithFilter(target, filter, instructions);
    } else {
      instructions = arg1;
    }
  }
  for (const key of Object.keys(instructions)) {
    if (!Array.isArray(instructions[key])) {
      target[key] = instructions[key];
      continue;
    }
    let [filter2, value] = instructions[key];
    if (typeof value === "function") {
      let _value;
      const defaultFilterPassed = filter2 === void 0 && (_value = value()) != null;
      const customFilterPassed = typeof filter2 === "function" && !!filter2(void 0) || typeof filter2 !== "function" && !!filter2;
      if (defaultFilterPassed) {
        target[key] = _value;
      } else if (customFilterPassed) {
        target[key] = value();
      }
    } else {
      const defaultFilterPassed = filter2 === void 0 && value != null;
      const customFilterPassed = typeof filter2 === "function" && !!filter2(value) || typeof filter2 !== "function" && !!filter2;
      if (defaultFilterPassed || customFilterPassed) {
        target[key] = value;
      }
    }
  }
  return target;
}
const mapWithFilter = (target, filter, instructions) => {
  return map$2(target, Object.entries(instructions).reduce((_instructions, [key, value]) => {
    if (Array.isArray(value)) {
      _instructions[key] = value;
    } else {
      if (typeof value === "function") {
        _instructions[key] = [filter, value()];
      } else {
        _instructions[key] = [filter, value];
      }
    }
    return _instructions;
  }, {}));
};
class SSMServiceException extends ServiceException {
  constructor(options) {
    super(options);
    Object.setPrototypeOf(this, SSMServiceException.prototype);
  }
}
var ResourceTypeForTagging;
(function(ResourceTypeForTagging2) {
  ResourceTypeForTagging2["ASSOCIATION"] = "Association";
  ResourceTypeForTagging2["AUTOMATION"] = "Automation";
  ResourceTypeForTagging2["DOCUMENT"] = "Document";
  ResourceTypeForTagging2["MAINTENANCE_WINDOW"] = "MaintenanceWindow";
  ResourceTypeForTagging2["MANAGED_INSTANCE"] = "ManagedInstance";
  ResourceTypeForTagging2["OPSMETADATA"] = "OpsMetadata";
  ResourceTypeForTagging2["OPS_ITEM"] = "OpsItem";
  ResourceTypeForTagging2["PARAMETER"] = "Parameter";
  ResourceTypeForTagging2["PATCH_BASELINE"] = "PatchBaseline";
})(ResourceTypeForTagging || (ResourceTypeForTagging = {}));
class InternalServerError extends SSMServiceException {
  constructor(opts) {
    super({
      name: "InternalServerError",
      $fault: "server",
      ...opts
    });
    this.name = "InternalServerError";
    this.$fault = "server";
    Object.setPrototypeOf(this, InternalServerError.prototype);
    this.Message = opts.Message;
  }
}
var ExternalAlarmState;
(function(ExternalAlarmState2) {
  ExternalAlarmState2["ALARM"] = "ALARM";
  ExternalAlarmState2["UNKNOWN"] = "UNKNOWN";
})(ExternalAlarmState || (ExternalAlarmState = {}));
var AssociationComplianceSeverity;
(function(AssociationComplianceSeverity2) {
  AssociationComplianceSeverity2["Critical"] = "CRITICAL";
  AssociationComplianceSeverity2["High"] = "HIGH";
  AssociationComplianceSeverity2["Low"] = "LOW";
  AssociationComplianceSeverity2["Medium"] = "MEDIUM";
  AssociationComplianceSeverity2["Unspecified"] = "UNSPECIFIED";
})(AssociationComplianceSeverity || (AssociationComplianceSeverity = {}));
var AssociationSyncCompliance;
(function(AssociationSyncCompliance2) {
  AssociationSyncCompliance2["Auto"] = "AUTO";
  AssociationSyncCompliance2["Manual"] = "MANUAL";
})(AssociationSyncCompliance || (AssociationSyncCompliance = {}));
var AssociationStatusName;
(function(AssociationStatusName2) {
  AssociationStatusName2["Failed"] = "Failed";
  AssociationStatusName2["Pending"] = "Pending";
  AssociationStatusName2["Success"] = "Success";
})(AssociationStatusName || (AssociationStatusName = {}));
var Fault;
(function(Fault2) {
  Fault2["Client"] = "Client";
  Fault2["Server"] = "Server";
  Fault2["Unknown"] = "Unknown";
})(Fault || (Fault = {}));
var AttachmentsSourceKey;
(function(AttachmentsSourceKey2) {
  AttachmentsSourceKey2["AttachmentReference"] = "AttachmentReference";
  AttachmentsSourceKey2["S3FileUrl"] = "S3FileUrl";
  AttachmentsSourceKey2["SourceUrl"] = "SourceUrl";
})(AttachmentsSourceKey || (AttachmentsSourceKey = {}));
var DocumentFormat;
(function(DocumentFormat2) {
  DocumentFormat2["JSON"] = "JSON";
  DocumentFormat2["TEXT"] = "TEXT";
  DocumentFormat2["YAML"] = "YAML";
})(DocumentFormat || (DocumentFormat = {}));
var DocumentType;
(function(DocumentType2) {
  DocumentType2["ApplicationConfiguration"] = "ApplicationConfiguration";
  DocumentType2["ApplicationConfigurationSchema"] = "ApplicationConfigurationSchema";
  DocumentType2["Automation"] = "Automation";
  DocumentType2["ChangeCalendar"] = "ChangeCalendar";
  DocumentType2["ChangeTemplate"] = "Automation.ChangeTemplate";
  DocumentType2["CloudFormation"] = "CloudFormation";
  DocumentType2["Command"] = "Command";
  DocumentType2["ConformancePackTemplate"] = "ConformancePackTemplate";
  DocumentType2["DeploymentStrategy"] = "DeploymentStrategy";
  DocumentType2["Package"] = "Package";
  DocumentType2["Policy"] = "Policy";
  DocumentType2["ProblemAnalysis"] = "ProblemAnalysis";
  DocumentType2["ProblemAnalysisTemplate"] = "ProblemAnalysisTemplate";
  DocumentType2["QuickSetup"] = "QuickSetup";
  DocumentType2["Session"] = "Session";
})(DocumentType || (DocumentType = {}));
var DocumentHashType;
(function(DocumentHashType2) {
  DocumentHashType2["SHA1"] = "Sha1";
  DocumentHashType2["SHA256"] = "Sha256";
})(DocumentHashType || (DocumentHashType = {}));
var DocumentParameterType;
(function(DocumentParameterType2) {
  DocumentParameterType2["String"] = "String";
  DocumentParameterType2["StringList"] = "StringList";
})(DocumentParameterType || (DocumentParameterType = {}));
var PlatformType;
(function(PlatformType2) {
  PlatformType2["LINUX"] = "Linux";
  PlatformType2["MACOS"] = "MacOS";
  PlatformType2["WINDOWS"] = "Windows";
})(PlatformType || (PlatformType = {}));
var ReviewStatus;
(function(ReviewStatus2) {
  ReviewStatus2["APPROVED"] = "APPROVED";
  ReviewStatus2["NOT_REVIEWED"] = "NOT_REVIEWED";
  ReviewStatus2["PENDING"] = "PENDING";
  ReviewStatus2["REJECTED"] = "REJECTED";
})(ReviewStatus || (ReviewStatus = {}));
var DocumentStatus;
(function(DocumentStatus2) {
  DocumentStatus2["Active"] = "Active";
  DocumentStatus2["Creating"] = "Creating";
  DocumentStatus2["Deleting"] = "Deleting";
  DocumentStatus2["Failed"] = "Failed";
  DocumentStatus2["Updating"] = "Updating";
})(DocumentStatus || (DocumentStatus = {}));
var OpsItemDataType;
(function(OpsItemDataType2) {
  OpsItemDataType2["SEARCHABLE_STRING"] = "SearchableString";
  OpsItemDataType2["STRING"] = "String";
})(OpsItemDataType || (OpsItemDataType = {}));
var PatchComplianceLevel;
(function(PatchComplianceLevel2) {
  PatchComplianceLevel2["Critical"] = "CRITICAL";
  PatchComplianceLevel2["High"] = "HIGH";
  PatchComplianceLevel2["Informational"] = "INFORMATIONAL";
  PatchComplianceLevel2["Low"] = "LOW";
  PatchComplianceLevel2["Medium"] = "MEDIUM";
  PatchComplianceLevel2["Unspecified"] = "UNSPECIFIED";
})(PatchComplianceLevel || (PatchComplianceLevel = {}));
var PatchFilterKey;
(function(PatchFilterKey2) {
  PatchFilterKey2["AdvisoryId"] = "ADVISORY_ID";
  PatchFilterKey2["Arch"] = "ARCH";
  PatchFilterKey2["BugzillaId"] = "BUGZILLA_ID";
  PatchFilterKey2["CVEId"] = "CVE_ID";
  PatchFilterKey2["Classification"] = "CLASSIFICATION";
  PatchFilterKey2["Epoch"] = "EPOCH";
  PatchFilterKey2["MsrcSeverity"] = "MSRC_SEVERITY";
  PatchFilterKey2["Name"] = "NAME";
  PatchFilterKey2["PatchId"] = "PATCH_ID";
  PatchFilterKey2["PatchSet"] = "PATCH_SET";
  PatchFilterKey2["Priority"] = "PRIORITY";
  PatchFilterKey2["Product"] = "PRODUCT";
  PatchFilterKey2["ProductFamily"] = "PRODUCT_FAMILY";
  PatchFilterKey2["Release"] = "RELEASE";
  PatchFilterKey2["Repository"] = "REPOSITORY";
  PatchFilterKey2["Section"] = "SECTION";
  PatchFilterKey2["Security"] = "SECURITY";
  PatchFilterKey2["Severity"] = "SEVERITY";
  PatchFilterKey2["Version"] = "VERSION";
})(PatchFilterKey || (PatchFilterKey = {}));
var OperatingSystem;
(function(OperatingSystem2) {
  OperatingSystem2["AmazonLinux"] = "AMAZON_LINUX";
  OperatingSystem2["AmazonLinux2"] = "AMAZON_LINUX_2";
  OperatingSystem2["AmazonLinux2022"] = "AMAZON_LINUX_2022";
  OperatingSystem2["CentOS"] = "CENTOS";
  OperatingSystem2["Debian"] = "DEBIAN";
  OperatingSystem2["MacOS"] = "MACOS";
  OperatingSystem2["OracleLinux"] = "ORACLE_LINUX";
  OperatingSystem2["Raspbian"] = "RASPBIAN";
  OperatingSystem2["RedhatEnterpriseLinux"] = "REDHAT_ENTERPRISE_LINUX";
  OperatingSystem2["Rocky_Linux"] = "ROCKY_LINUX";
  OperatingSystem2["Suse"] = "SUSE";
  OperatingSystem2["Ubuntu"] = "UBUNTU";
  OperatingSystem2["Windows"] = "WINDOWS";
})(OperatingSystem || (OperatingSystem = {}));
var PatchAction;
(function(PatchAction2) {
  PatchAction2["AllowAsDependency"] = "ALLOW_AS_DEPENDENCY";
  PatchAction2["Block"] = "BLOCK";
})(PatchAction || (PatchAction = {}));
var ResourceDataSyncS3Format;
(function(ResourceDataSyncS3Format2) {
  ResourceDataSyncS3Format2["JSON_SERDE"] = "JsonSerDe";
})(ResourceDataSyncS3Format || (ResourceDataSyncS3Format = {}));
var InventorySchemaDeleteOption;
(function(InventorySchemaDeleteOption2) {
  InventorySchemaDeleteOption2["DELETE_SCHEMA"] = "DeleteSchema";
  InventorySchemaDeleteOption2["DISABLE_SCHEMA"] = "DisableSchema";
})(InventorySchemaDeleteOption || (InventorySchemaDeleteOption = {}));
var DescribeActivationsFilterKeys;
(function(DescribeActivationsFilterKeys2) {
  DescribeActivationsFilterKeys2["ACTIVATION_IDS"] = "ActivationIds";
  DescribeActivationsFilterKeys2["DEFAULT_INSTANCE_NAME"] = "DefaultInstanceName";
  DescribeActivationsFilterKeys2["IAM_ROLE"] = "IamRole";
})(DescribeActivationsFilterKeys || (DescribeActivationsFilterKeys = {}));
var AssociationExecutionFilterKey;
(function(AssociationExecutionFilterKey2) {
  AssociationExecutionFilterKey2["CreatedTime"] = "CreatedTime";
  AssociationExecutionFilterKey2["ExecutionId"] = "ExecutionId";
  AssociationExecutionFilterKey2["Status"] = "Status";
})(AssociationExecutionFilterKey || (AssociationExecutionFilterKey = {}));
var AssociationFilterOperatorType;
(function(AssociationFilterOperatorType2) {
  AssociationFilterOperatorType2["Equal"] = "EQUAL";
  AssociationFilterOperatorType2["GreaterThan"] = "GREATER_THAN";
  AssociationFilterOperatorType2["LessThan"] = "LESS_THAN";
})(AssociationFilterOperatorType || (AssociationFilterOperatorType = {}));
var AssociationExecutionTargetsFilterKey;
(function(AssociationExecutionTargetsFilterKey2) {
  AssociationExecutionTargetsFilterKey2["ResourceId"] = "ResourceId";
  AssociationExecutionTargetsFilterKey2["ResourceType"] = "ResourceType";
  AssociationExecutionTargetsFilterKey2["Status"] = "Status";
})(AssociationExecutionTargetsFilterKey || (AssociationExecutionTargetsFilterKey = {}));
var AutomationExecutionFilterKey;
(function(AutomationExecutionFilterKey2) {
  AutomationExecutionFilterKey2["AUTOMATION_SUBTYPE"] = "AutomationSubtype";
  AutomationExecutionFilterKey2["AUTOMATION_TYPE"] = "AutomationType";
  AutomationExecutionFilterKey2["CURRENT_ACTION"] = "CurrentAction";
  AutomationExecutionFilterKey2["DOCUMENT_NAME_PREFIX"] = "DocumentNamePrefix";
  AutomationExecutionFilterKey2["EXECUTION_ID"] = "ExecutionId";
  AutomationExecutionFilterKey2["EXECUTION_STATUS"] = "ExecutionStatus";
  AutomationExecutionFilterKey2["OPS_ITEM_ID"] = "OpsItemId";
  AutomationExecutionFilterKey2["PARENT_EXECUTION_ID"] = "ParentExecutionId";
  AutomationExecutionFilterKey2["START_TIME_AFTER"] = "StartTimeAfter";
  AutomationExecutionFilterKey2["START_TIME_BEFORE"] = "StartTimeBefore";
  AutomationExecutionFilterKey2["TAG_KEY"] = "TagKey";
  AutomationExecutionFilterKey2["TARGET_RESOURCE_GROUP"] = "TargetResourceGroup";
})(AutomationExecutionFilterKey || (AutomationExecutionFilterKey = {}));
var AutomationExecutionStatus;
(function(AutomationExecutionStatus2) {
  AutomationExecutionStatus2["APPROVED"] = "Approved";
  AutomationExecutionStatus2["CANCELLED"] = "Cancelled";
  AutomationExecutionStatus2["CANCELLING"] = "Cancelling";
  AutomationExecutionStatus2["CHANGE_CALENDAR_OVERRIDE_APPROVED"] = "ChangeCalendarOverrideApproved";
  AutomationExecutionStatus2["CHANGE_CALENDAR_OVERRIDE_REJECTED"] = "ChangeCalendarOverrideRejected";
  AutomationExecutionStatus2["COMPLETED_WITH_FAILURE"] = "CompletedWithFailure";
  AutomationExecutionStatus2["COMPLETED_WITH_SUCCESS"] = "CompletedWithSuccess";
  AutomationExecutionStatus2["FAILED"] = "Failed";
  AutomationExecutionStatus2["INPROGRESS"] = "InProgress";
  AutomationExecutionStatus2["PENDING"] = "Pending";
  AutomationExecutionStatus2["PENDING_APPROVAL"] = "PendingApproval";
  AutomationExecutionStatus2["PENDING_CHANGE_CALENDAR_OVERRIDE"] = "PendingChangeCalendarOverride";
  AutomationExecutionStatus2["REJECTED"] = "Rejected";
  AutomationExecutionStatus2["RUNBOOK_INPROGRESS"] = "RunbookInProgress";
  AutomationExecutionStatus2["SCHEDULED"] = "Scheduled";
  AutomationExecutionStatus2["SUCCESS"] = "Success";
  AutomationExecutionStatus2["TIMEDOUT"] = "TimedOut";
  AutomationExecutionStatus2["WAITING"] = "Waiting";
})(AutomationExecutionStatus || (AutomationExecutionStatus = {}));
var AutomationSubtype;
(function(AutomationSubtype2) {
  AutomationSubtype2["ChangeRequest"] = "ChangeRequest";
})(AutomationSubtype || (AutomationSubtype = {}));
var AutomationType;
(function(AutomationType2) {
  AutomationType2["CrossAccount"] = "CrossAccount";
  AutomationType2["Local"] = "Local";
})(AutomationType || (AutomationType = {}));
var ExecutionMode;
(function(ExecutionMode2) {
  ExecutionMode2["Auto"] = "Auto";
  ExecutionMode2["Interactive"] = "Interactive";
})(ExecutionMode || (ExecutionMode = {}));
var StepExecutionFilterKey;
(function(StepExecutionFilterKey2) {
  StepExecutionFilterKey2["ACTION"] = "Action";
  StepExecutionFilterKey2["START_TIME_AFTER"] = "StartTimeAfter";
  StepExecutionFilterKey2["START_TIME_BEFORE"] = "StartTimeBefore";
  StepExecutionFilterKey2["STEP_EXECUTION_ID"] = "StepExecutionId";
  StepExecutionFilterKey2["STEP_EXECUTION_STATUS"] = "StepExecutionStatus";
  StepExecutionFilterKey2["STEP_NAME"] = "StepName";
})(StepExecutionFilterKey || (StepExecutionFilterKey = {}));
var DocumentPermissionType;
(function(DocumentPermissionType2) {
  DocumentPermissionType2["SHARE"] = "Share";
})(DocumentPermissionType || (DocumentPermissionType = {}));
var PatchDeploymentStatus;
(function(PatchDeploymentStatus2) {
  PatchDeploymentStatus2["Approved"] = "APPROVED";
  PatchDeploymentStatus2["ExplicitApproved"] = "EXPLICIT_APPROVED";
  PatchDeploymentStatus2["ExplicitRejected"] = "EXPLICIT_REJECTED";
  PatchDeploymentStatus2["PendingApproval"] = "PENDING_APPROVAL";
})(PatchDeploymentStatus || (PatchDeploymentStatus = {}));
var InstanceInformationFilterKey;
(function(InstanceInformationFilterKey2) {
  InstanceInformationFilterKey2["ACTIVATION_IDS"] = "ActivationIds";
  InstanceInformationFilterKey2["AGENT_VERSION"] = "AgentVersion";
  InstanceInformationFilterKey2["ASSOCIATION_STATUS"] = "AssociationStatus";
  InstanceInformationFilterKey2["IAM_ROLE"] = "IamRole";
  InstanceInformationFilterKey2["INSTANCE_IDS"] = "InstanceIds";
  InstanceInformationFilterKey2["PING_STATUS"] = "PingStatus";
  InstanceInformationFilterKey2["PLATFORM_TYPES"] = "PlatformTypes";
  InstanceInformationFilterKey2["RESOURCE_TYPE"] = "ResourceType";
})(InstanceInformationFilterKey || (InstanceInformationFilterKey = {}));
var PingStatus;
(function(PingStatus2) {
  PingStatus2["CONNECTION_LOST"] = "ConnectionLost";
  PingStatus2["INACTIVE"] = "Inactive";
  PingStatus2["ONLINE"] = "Online";
})(PingStatus || (PingStatus = {}));
var ResourceType;
(function(ResourceType2) {
  ResourceType2["DOCUMENT"] = "Document";
  ResourceType2["EC2_INSTANCE"] = "EC2Instance";
  ResourceType2["MANAGED_INSTANCE"] = "ManagedInstance";
})(ResourceType || (ResourceType = {}));
var SourceType;
(function(SourceType2) {
  SourceType2["AWS_EC2_INSTANCE"] = "AWS::EC2::Instance";
  SourceType2["AWS_IOT_THING"] = "AWS::IoT::Thing";
  SourceType2["AWS_SSM_MANAGEDINSTANCE"] = "AWS::SSM::ManagedInstance";
})(SourceType || (SourceType = {}));
var PatchComplianceDataState;
(function(PatchComplianceDataState2) {
  PatchComplianceDataState2["Failed"] = "FAILED";
  PatchComplianceDataState2["Installed"] = "INSTALLED";
  PatchComplianceDataState2["InstalledOther"] = "INSTALLED_OTHER";
  PatchComplianceDataState2["InstalledPendingReboot"] = "INSTALLED_PENDING_REBOOT";
  PatchComplianceDataState2["InstalledRejected"] = "INSTALLED_REJECTED";
  PatchComplianceDataState2["Missing"] = "MISSING";
  PatchComplianceDataState2["NotApplicable"] = "NOT_APPLICABLE";
})(PatchComplianceDataState || (PatchComplianceDataState = {}));
var PatchOperationType;
(function(PatchOperationType2) {
  PatchOperationType2["INSTALL"] = "Install";
  PatchOperationType2["SCAN"] = "Scan";
})(PatchOperationType || (PatchOperationType = {}));
var RebootOption;
(function(RebootOption2) {
  RebootOption2["NO_REBOOT"] = "NoReboot";
  RebootOption2["REBOOT_IF_NEEDED"] = "RebootIfNeeded";
})(RebootOption || (RebootOption = {}));
var InstancePatchStateOperatorType;
(function(InstancePatchStateOperatorType2) {
  InstancePatchStateOperatorType2["EQUAL"] = "Equal";
  InstancePatchStateOperatorType2["GREATER_THAN"] = "GreaterThan";
  InstancePatchStateOperatorType2["LESS_THAN"] = "LessThan";
  InstancePatchStateOperatorType2["NOT_EQUAL"] = "NotEqual";
})(InstancePatchStateOperatorType || (InstancePatchStateOperatorType = {}));
var InventoryDeletionStatus;
(function(InventoryDeletionStatus2) {
  InventoryDeletionStatus2["COMPLETE"] = "Complete";
  InventoryDeletionStatus2["IN_PROGRESS"] = "InProgress";
})(InventoryDeletionStatus || (InventoryDeletionStatus = {}));
var MaintenanceWindowExecutionStatus;
(function(MaintenanceWindowExecutionStatus2) {
  MaintenanceWindowExecutionStatus2["Cancelled"] = "CANCELLED";
  MaintenanceWindowExecutionStatus2["Cancelling"] = "CANCELLING";
  MaintenanceWindowExecutionStatus2["Failed"] = "FAILED";
  MaintenanceWindowExecutionStatus2["InProgress"] = "IN_PROGRESS";
  MaintenanceWindowExecutionStatus2["Pending"] = "PENDING";
  MaintenanceWindowExecutionStatus2["SkippedOverlapping"] = "SKIPPED_OVERLAPPING";
  MaintenanceWindowExecutionStatus2["Success"] = "SUCCESS";
  MaintenanceWindowExecutionStatus2["TimedOut"] = "TIMED_OUT";
})(MaintenanceWindowExecutionStatus || (MaintenanceWindowExecutionStatus = {}));
var MaintenanceWindowTaskType;
(function(MaintenanceWindowTaskType2) {
  MaintenanceWindowTaskType2["Automation"] = "AUTOMATION";
  MaintenanceWindowTaskType2["Lambda"] = "LAMBDA";
  MaintenanceWindowTaskType2["RunCommand"] = "RUN_COMMAND";
  MaintenanceWindowTaskType2["StepFunctions"] = "STEP_FUNCTIONS";
})(MaintenanceWindowTaskType || (MaintenanceWindowTaskType = {}));
var MaintenanceWindowResourceType;
(function(MaintenanceWindowResourceType2) {
  MaintenanceWindowResourceType2["Instance"] = "INSTANCE";
  MaintenanceWindowResourceType2["ResourceGroup"] = "RESOURCE_GROUP";
})(MaintenanceWindowResourceType || (MaintenanceWindowResourceType = {}));
var MaintenanceWindowTaskCutoffBehavior;
(function(MaintenanceWindowTaskCutoffBehavior2) {
  MaintenanceWindowTaskCutoffBehavior2["CancelTask"] = "CANCEL_TASK";
  MaintenanceWindowTaskCutoffBehavior2["ContinueTask"] = "CONTINUE_TASK";
})(MaintenanceWindowTaskCutoffBehavior || (MaintenanceWindowTaskCutoffBehavior = {}));
var OpsItemFilterKey;
(function(OpsItemFilterKey2) {
  OpsItemFilterKey2["ACCOUNT_ID"] = "AccountId";
  OpsItemFilterKey2["ACTUAL_END_TIME"] = "ActualEndTime";
  OpsItemFilterKey2["ACTUAL_START_TIME"] = "ActualStartTime";
  OpsItemFilterKey2["AUTOMATION_ID"] = "AutomationId";
  OpsItemFilterKey2["CATEGORY"] = "Category";
  OpsItemFilterKey2["CHANGE_REQUEST_APPROVER_ARN"] = "ChangeRequestByApproverArn";
  OpsItemFilterKey2["CHANGE_REQUEST_APPROVER_NAME"] = "ChangeRequestByApproverName";
  OpsItemFilterKey2["CHANGE_REQUEST_REQUESTER_ARN"] = "ChangeRequestByRequesterArn";
  OpsItemFilterKey2["CHANGE_REQUEST_REQUESTER_NAME"] = "ChangeRequestByRequesterName";
  OpsItemFilterKey2["CHANGE_REQUEST_TARGETS_RESOURCE_GROUP"] = "ChangeRequestByTargetsResourceGroup";
  OpsItemFilterKey2["CHANGE_REQUEST_TEMPLATE"] = "ChangeRequestByTemplate";
  OpsItemFilterKey2["CREATED_BY"] = "CreatedBy";
  OpsItemFilterKey2["CREATED_TIME"] = "CreatedTime";
  OpsItemFilterKey2["INSIGHT_TYPE"] = "InsightByType";
  OpsItemFilterKey2["LAST_MODIFIED_TIME"] = "LastModifiedTime";
  OpsItemFilterKey2["OPERATIONAL_DATA"] = "OperationalData";
  OpsItemFilterKey2["OPERATIONAL_DATA_KEY"] = "OperationalDataKey";
  OpsItemFilterKey2["OPERATIONAL_DATA_VALUE"] = "OperationalDataValue";
  OpsItemFilterKey2["OPSITEM_ID"] = "OpsItemId";
  OpsItemFilterKey2["OPSITEM_TYPE"] = "OpsItemType";
  OpsItemFilterKey2["PLANNED_END_TIME"] = "PlannedEndTime";
  OpsItemFilterKey2["PLANNED_START_TIME"] = "PlannedStartTime";
  OpsItemFilterKey2["PRIORITY"] = "Priority";
  OpsItemFilterKey2["RESOURCE_ID"] = "ResourceId";
  OpsItemFilterKey2["SEVERITY"] = "Severity";
  OpsItemFilterKey2["SOURCE"] = "Source";
  OpsItemFilterKey2["STATUS"] = "Status";
  OpsItemFilterKey2["TITLE"] = "Title";
})(OpsItemFilterKey || (OpsItemFilterKey = {}));
var OpsItemFilterOperator;
(function(OpsItemFilterOperator2) {
  OpsItemFilterOperator2["CONTAINS"] = "Contains";
  OpsItemFilterOperator2["EQUAL"] = "Equal";
  OpsItemFilterOperator2["GREATER_THAN"] = "GreaterThan";
  OpsItemFilterOperator2["LESS_THAN"] = "LessThan";
})(OpsItemFilterOperator || (OpsItemFilterOperator = {}));
var FieldPosition;
(function(FieldPosition2) {
  FieldPosition2[FieldPosition2["HEADER"] = 0] = "HEADER";
  FieldPosition2[FieldPosition2["TRAILER"] = 1] = "TRAILER";
})(FieldPosition || (FieldPosition = {}));
class HttpRequest {
  constructor(options) {
    this.method = options.method || "GET";
    this.hostname = options.hostname || "localhost";
    this.port = options.port;
    this.query = options.query || {};
    this.headers = options.headers || {};
    this.body = options.body;
    this.protocol = options.protocol ? options.protocol.slice(-1) !== ":" ? `${options.protocol}:` : options.protocol : "https:";
    this.path = options.path ? options.path.charAt(0) !== "/" ? `/${options.path}` : options.path : "/";
  }
  static isInstance(request2) {
    if (!request2)
      return false;
    const req = request2;
    return "method" in req && "protocol" in req && "hostname" in req && "path" in req && typeof req["query"] === "object" && typeof req["headers"] === "object";
  }
  clone() {
    const cloned = new HttpRequest({
      ...this,
      headers: { ...this.headers }
    });
    if (cloned.query)
      cloned.query = cloneQuery$1(cloned.query);
    return cloned;
  }
}
function cloneQuery$1(query) {
  return Object.keys(query).reduce((carry, paramName) => {
    const param = query[paramName];
    return {
      ...carry,
      [paramName]: Array.isArray(param) ? [...param] : param
    };
  }, {});
}
class HttpResponse {
  constructor(options) {
    this.statusCode = options.statusCode;
    this.headers = options.headers || {};
    this.body = options.body;
  }
  static isInstance(response) {
    if (!response)
      return false;
    const resp = response;
    return typeof resp.statusCode === "number" && typeof resp.headers === "object";
  }
}
const rnds8Pool = new Uint8Array(256);
let poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    crypto.randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}
const REGEX = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
function validate(uuid) {
  return typeof uuid === "string" && REGEX.test(uuid);
}
const byteToHex = [];
for (let i2 = 0; i2 < 256; ++i2) {
  byteToHex.push((i2 + 256).toString(16).substr(1));
}
function stringify(arr, offset = 0) {
  const uuid = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
  if (!validate(uuid)) {
    throw TypeError("Stringified UUID is invalid");
  }
  return uuid;
}
function v4(options, buf, offset) {
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i2 = 0; i2 < 16; ++i2) {
      buf[offset + i2] = rnds[i2];
    }
    return buf;
  }
  return stringify(rnds);
}
var OpsItemStatus;
(function(OpsItemStatus2) {
  OpsItemStatus2["APPROVED"] = "Approved";
  OpsItemStatus2["CANCELLED"] = "Cancelled";
  OpsItemStatus2["CANCELLING"] = "Cancelling";
  OpsItemStatus2["CHANGE_CALENDAR_OVERRIDE_APPROVED"] = "ChangeCalendarOverrideApproved";
  OpsItemStatus2["CHANGE_CALENDAR_OVERRIDE_REJECTED"] = "ChangeCalendarOverrideRejected";
  OpsItemStatus2["CLOSED"] = "Closed";
  OpsItemStatus2["COMPLETED_WITH_FAILURE"] = "CompletedWithFailure";
  OpsItemStatus2["COMPLETED_WITH_SUCCESS"] = "CompletedWithSuccess";
  OpsItemStatus2["FAILED"] = "Failed";
  OpsItemStatus2["IN_PROGRESS"] = "InProgress";
  OpsItemStatus2["OPEN"] = "Open";
  OpsItemStatus2["PENDING"] = "Pending";
  OpsItemStatus2["PENDING_APPROVAL"] = "PendingApproval";
  OpsItemStatus2["PENDING_CHANGE_CALENDAR_OVERRIDE"] = "PendingChangeCalendarOverride";
  OpsItemStatus2["REJECTED"] = "Rejected";
  OpsItemStatus2["RESOLVED"] = "Resolved";
  OpsItemStatus2["RUNBOOK_IN_PROGRESS"] = "RunbookInProgress";
  OpsItemStatus2["SCHEDULED"] = "Scheduled";
  OpsItemStatus2["TIMED_OUT"] = "TimedOut";
})(OpsItemStatus || (OpsItemStatus = {}));
var ParametersFilterKey;
(function(ParametersFilterKey2) {
  ParametersFilterKey2["KEY_ID"] = "KeyId";
  ParametersFilterKey2["NAME"] = "Name";
  ParametersFilterKey2["TYPE"] = "Type";
})(ParametersFilterKey || (ParametersFilterKey = {}));
var ParameterTier;
(function(ParameterTier2) {
  ParameterTier2["ADVANCED"] = "Advanced";
  ParameterTier2["INTELLIGENT_TIERING"] = "Intelligent-Tiering";
  ParameterTier2["STANDARD"] = "Standard";
})(ParameterTier || (ParameterTier = {}));
var ParameterType;
(function(ParameterType2) {
  ParameterType2["SECURE_STRING"] = "SecureString";
  ParameterType2["STRING"] = "String";
  ParameterType2["STRING_LIST"] = "StringList";
})(ParameterType || (ParameterType = {}));
var PatchSet;
(function(PatchSet2) {
  PatchSet2["Application"] = "APPLICATION";
  PatchSet2["Os"] = "OS";
})(PatchSet || (PatchSet = {}));
var PatchProperty;
(function(PatchProperty2) {
  PatchProperty2["PatchClassification"] = "CLASSIFICATION";
  PatchProperty2["PatchMsrcSeverity"] = "MSRC_SEVERITY";
  PatchProperty2["PatchPriority"] = "PRIORITY";
  PatchProperty2["PatchProductFamily"] = "PRODUCT_FAMILY";
  PatchProperty2["PatchSeverity"] = "SEVERITY";
  PatchProperty2["Product"] = "PRODUCT";
})(PatchProperty || (PatchProperty = {}));
var SessionFilterKey;
(function(SessionFilterKey2) {
  SessionFilterKey2["INVOKED_AFTER"] = "InvokedAfter";
  SessionFilterKey2["INVOKED_BEFORE"] = "InvokedBefore";
  SessionFilterKey2["OWNER"] = "Owner";
  SessionFilterKey2["SESSION_ID"] = "SessionId";
  SessionFilterKey2["STATUS"] = "Status";
  SessionFilterKey2["TARGET_ID"] = "Target";
})(SessionFilterKey || (SessionFilterKey = {}));
var SessionState;
(function(SessionState2) {
  SessionState2["ACTIVE"] = "Active";
  SessionState2["HISTORY"] = "History";
})(SessionState || (SessionState = {}));
var SessionStatus;
(function(SessionStatus2) {
  SessionStatus2["CONNECTED"] = "Connected";
  SessionStatus2["CONNECTING"] = "Connecting";
  SessionStatus2["DISCONNECTED"] = "Disconnected";
  SessionStatus2["FAILED"] = "Failed";
  SessionStatus2["TERMINATED"] = "Terminated";
  SessionStatus2["TERMINATING"] = "Terminating";
})(SessionStatus || (SessionStatus = {}));
var CalendarState;
(function(CalendarState2) {
  CalendarState2["CLOSED"] = "CLOSED";
  CalendarState2["OPEN"] = "OPEN";
})(CalendarState || (CalendarState = {}));
var CommandInvocationStatus;
(function(CommandInvocationStatus2) {
  CommandInvocationStatus2["CANCELLED"] = "Cancelled";
  CommandInvocationStatus2["CANCELLING"] = "Cancelling";
  CommandInvocationStatus2["DELAYED"] = "Delayed";
  CommandInvocationStatus2["FAILED"] = "Failed";
  CommandInvocationStatus2["IN_PROGRESS"] = "InProgress";
  CommandInvocationStatus2["PENDING"] = "Pending";
  CommandInvocationStatus2["SUCCESS"] = "Success";
  CommandInvocationStatus2["TIMED_OUT"] = "TimedOut";
})(CommandInvocationStatus || (CommandInvocationStatus = {}));
var ConnectionStatus;
(function(ConnectionStatus2) {
  ConnectionStatus2["CONNECTED"] = "Connected";
  ConnectionStatus2["NOT_CONNECTED"] = "NotConnected";
})(ConnectionStatus || (ConnectionStatus = {}));
var AttachmentHashType;
(function(AttachmentHashType2) {
  AttachmentHashType2["SHA256"] = "Sha256";
})(AttachmentHashType || (AttachmentHashType = {}));
var InventoryQueryOperatorType;
(function(InventoryQueryOperatorType2) {
  InventoryQueryOperatorType2["BEGIN_WITH"] = "BeginWith";
  InventoryQueryOperatorType2["EQUAL"] = "Equal";
  InventoryQueryOperatorType2["EXISTS"] = "Exists";
  InventoryQueryOperatorType2["GREATER_THAN"] = "GreaterThan";
  InventoryQueryOperatorType2["LESS_THAN"] = "LessThan";
  InventoryQueryOperatorType2["NOT_EQUAL"] = "NotEqual";
})(InventoryQueryOperatorType || (InventoryQueryOperatorType = {}));
var InventoryAttributeDataType;
(function(InventoryAttributeDataType2) {
  InventoryAttributeDataType2["NUMBER"] = "number";
  InventoryAttributeDataType2["STRING"] = "string";
})(InventoryAttributeDataType || (InventoryAttributeDataType = {}));
var NotificationEvent;
(function(NotificationEvent2) {
  NotificationEvent2["ALL"] = "All";
  NotificationEvent2["CANCELLED"] = "Cancelled";
  NotificationEvent2["FAILED"] = "Failed";
  NotificationEvent2["IN_PROGRESS"] = "InProgress";
  NotificationEvent2["SUCCESS"] = "Success";
  NotificationEvent2["TIMED_OUT"] = "TimedOut";
})(NotificationEvent || (NotificationEvent = {}));
var NotificationType;
(function(NotificationType2) {
  NotificationType2["Command"] = "Command";
  NotificationType2["Invocation"] = "Invocation";
})(NotificationType || (NotificationType = {}));
var OpsFilterOperatorType;
(function(OpsFilterOperatorType2) {
  OpsFilterOperatorType2["BEGIN_WITH"] = "BeginWith";
  OpsFilterOperatorType2["EQUAL"] = "Equal";
  OpsFilterOperatorType2["EXISTS"] = "Exists";
  OpsFilterOperatorType2["GREATER_THAN"] = "GreaterThan";
  OpsFilterOperatorType2["LESS_THAN"] = "LessThan";
  OpsFilterOperatorType2["NOT_EQUAL"] = "NotEqual";
})(OpsFilterOperatorType || (OpsFilterOperatorType = {}));
class InvalidKeyId extends SSMServiceException {
  constructor(opts) {
    super({
      name: "InvalidKeyId",
      $fault: "client",
      ...opts
    });
    this.name = "InvalidKeyId";
    this.$fault = "client";
    Object.setPrototypeOf(this, InvalidKeyId.prototype);
  }
}
var AssociationFilterKey;
(function(AssociationFilterKey2) {
  AssociationFilterKey2["AssociationId"] = "AssociationId";
  AssociationFilterKey2["AssociationName"] = "AssociationName";
  AssociationFilterKey2["InstanceId"] = "InstanceId";
  AssociationFilterKey2["LastExecutedAfter"] = "LastExecutedAfter";
  AssociationFilterKey2["LastExecutedBefore"] = "LastExecutedBefore";
  AssociationFilterKey2["Name"] = "Name";
  AssociationFilterKey2["ResourceGroupName"] = "ResourceGroupName";
  AssociationFilterKey2["Status"] = "AssociationStatusName";
})(AssociationFilterKey || (AssociationFilterKey = {}));
var CommandFilterKey;
(function(CommandFilterKey2) {
  CommandFilterKey2["DOCUMENT_NAME"] = "DocumentName";
  CommandFilterKey2["EXECUTION_STAGE"] = "ExecutionStage";
  CommandFilterKey2["INVOKED_AFTER"] = "InvokedAfter";
  CommandFilterKey2["INVOKED_BEFORE"] = "InvokedBefore";
  CommandFilterKey2["STATUS"] = "Status";
})(CommandFilterKey || (CommandFilterKey = {}));
var CommandPluginStatus;
(function(CommandPluginStatus2) {
  CommandPluginStatus2["CANCELLED"] = "Cancelled";
  CommandPluginStatus2["FAILED"] = "Failed";
  CommandPluginStatus2["IN_PROGRESS"] = "InProgress";
  CommandPluginStatus2["PENDING"] = "Pending";
  CommandPluginStatus2["SUCCESS"] = "Success";
  CommandPluginStatus2["TIMED_OUT"] = "TimedOut";
})(CommandPluginStatus || (CommandPluginStatus = {}));
var CommandStatus;
(function(CommandStatus2) {
  CommandStatus2["CANCELLED"] = "Cancelled";
  CommandStatus2["CANCELLING"] = "Cancelling";
  CommandStatus2["FAILED"] = "Failed";
  CommandStatus2["IN_PROGRESS"] = "InProgress";
  CommandStatus2["PENDING"] = "Pending";
  CommandStatus2["SUCCESS"] = "Success";
  CommandStatus2["TIMED_OUT"] = "TimedOut";
})(CommandStatus || (CommandStatus = {}));
var ComplianceQueryOperatorType;
(function(ComplianceQueryOperatorType2) {
  ComplianceQueryOperatorType2["BeginWith"] = "BEGIN_WITH";
  ComplianceQueryOperatorType2["Equal"] = "EQUAL";
  ComplianceQueryOperatorType2["GreaterThan"] = "GREATER_THAN";
  ComplianceQueryOperatorType2["LessThan"] = "LESS_THAN";
  ComplianceQueryOperatorType2["NotEqual"] = "NOT_EQUAL";
})(ComplianceQueryOperatorType || (ComplianceQueryOperatorType = {}));
var ComplianceSeverity;
(function(ComplianceSeverity2) {
  ComplianceSeverity2["Critical"] = "CRITICAL";
  ComplianceSeverity2["High"] = "HIGH";
  ComplianceSeverity2["Informational"] = "INFORMATIONAL";
  ComplianceSeverity2["Low"] = "LOW";
  ComplianceSeverity2["Medium"] = "MEDIUM";
  ComplianceSeverity2["Unspecified"] = "UNSPECIFIED";
})(ComplianceSeverity || (ComplianceSeverity = {}));
var ComplianceStatus;
(function(ComplianceStatus2) {
  ComplianceStatus2["Compliant"] = "COMPLIANT";
  ComplianceStatus2["NonCompliant"] = "NON_COMPLIANT";
})(ComplianceStatus || (ComplianceStatus = {}));
var DocumentMetadataEnum;
(function(DocumentMetadataEnum2) {
  DocumentMetadataEnum2["DocumentReviews"] = "DocumentReviews";
})(DocumentMetadataEnum || (DocumentMetadataEnum = {}));
var DocumentReviewCommentType;
(function(DocumentReviewCommentType2) {
  DocumentReviewCommentType2["Comment"] = "Comment";
})(DocumentReviewCommentType || (DocumentReviewCommentType = {}));
var DocumentFilterKey;
(function(DocumentFilterKey2) {
  DocumentFilterKey2["DocumentType"] = "DocumentType";
  DocumentFilterKey2["Name"] = "Name";
  DocumentFilterKey2["Owner"] = "Owner";
  DocumentFilterKey2["PlatformTypes"] = "PlatformTypes";
})(DocumentFilterKey || (DocumentFilterKey = {}));
var OpsItemEventFilterKey;
(function(OpsItemEventFilterKey2) {
  OpsItemEventFilterKey2["OPSITEM_ID"] = "OpsItemId";
})(OpsItemEventFilterKey || (OpsItemEventFilterKey = {}));
var OpsItemEventFilterOperator;
(function(OpsItemEventFilterOperator2) {
  OpsItemEventFilterOperator2["EQUAL"] = "Equal";
})(OpsItemEventFilterOperator || (OpsItemEventFilterOperator = {}));
var OpsItemRelatedItemsFilterKey;
(function(OpsItemRelatedItemsFilterKey2) {
  OpsItemRelatedItemsFilterKey2["ASSOCIATION_ID"] = "AssociationId";
  OpsItemRelatedItemsFilterKey2["RESOURCE_TYPE"] = "ResourceType";
  OpsItemRelatedItemsFilterKey2["RESOURCE_URI"] = "ResourceUri";
})(OpsItemRelatedItemsFilterKey || (OpsItemRelatedItemsFilterKey = {}));
var OpsItemRelatedItemsFilterOperator;
(function(OpsItemRelatedItemsFilterOperator2) {
  OpsItemRelatedItemsFilterOperator2["EQUAL"] = "Equal";
})(OpsItemRelatedItemsFilterOperator || (OpsItemRelatedItemsFilterOperator = {}));
var LastResourceDataSyncStatus;
(function(LastResourceDataSyncStatus2) {
  LastResourceDataSyncStatus2["FAILED"] = "Failed";
  LastResourceDataSyncStatus2["INPROGRESS"] = "InProgress";
  LastResourceDataSyncStatus2["SUCCESSFUL"] = "Successful";
})(LastResourceDataSyncStatus || (LastResourceDataSyncStatus = {}));
var ComplianceUploadType;
(function(ComplianceUploadType2) {
  ComplianceUploadType2["Complete"] = "COMPLETE";
  ComplianceUploadType2["Partial"] = "PARTIAL";
})(ComplianceUploadType || (ComplianceUploadType = {}));
var SignalType;
(function(SignalType2) {
  SignalType2["APPROVE"] = "Approve";
  SignalType2["REJECT"] = "Reject";
  SignalType2["RESUME"] = "Resume";
  SignalType2["START_STEP"] = "StartStep";
  SignalType2["STOP_STEP"] = "StopStep";
})(SignalType || (SignalType = {}));
var StopType;
(function(StopType2) {
  StopType2["CANCEL"] = "Cancel";
  StopType2["COMPLETE"] = "Complete";
})(StopType || (StopType = {}));
const ParameterFilterSensitiveLog = (obj) => ({
  ...obj,
  ...obj.Value && { Value: SENSITIVE_STRING }
});
const GetParametersRequestFilterSensitiveLog = (obj) => ({
  ...obj
});
const GetParametersResultFilterSensitiveLog = (obj) => ({
  ...obj,
  ...obj.Parameters && { Parameters: obj.Parameters.map((item) => ParameterFilterSensitiveLog(item)) }
});
const serializeAws_json1_1GetParametersCommand = async (input, context) => {
  const headers = {
    "content-type": "application/x-amz-json-1.1",
    "x-amz-target": "AmazonSSM.GetParameters"
  };
  let body;
  body = JSON.stringify(serializeAws_json1_1GetParametersRequest(input));
  return buildHttpRpcRequest$1(context, headers, "/", void 0, body);
};
const deserializeAws_json1_1GetParametersCommand = async (output, context) => {
  if (output.statusCode >= 300) {
    return deserializeAws_json1_1GetParametersCommandError(output, context);
  }
  const data = await parseBody$3(output.body, context);
  let contents = {};
  contents = deserializeAws_json1_1GetParametersResult(data);
  const response = {
    $metadata: deserializeMetadata$3(output),
    ...contents
  };
  return Promise.resolve(response);
};
const deserializeAws_json1_1GetParametersCommandError = async (output, context) => {
  const parsedOutput = {
    ...output,
    body: await parseErrorBody$3(output.body, context)
  };
  const errorCode = loadRestJsonErrorCode$2(output, parsedOutput.body);
  switch (errorCode) {
    case "InternalServerError":
    case "com.amazonaws.ssm#InternalServerError":
      throw await deserializeAws_json1_1InternalServerErrorResponse(parsedOutput);
    case "InvalidKeyId":
    case "com.amazonaws.ssm#InvalidKeyId":
      throw await deserializeAws_json1_1InvalidKeyIdResponse(parsedOutput);
    default:
      const parsedBody = parsedOutput.body;
      throwDefaultError({
        output,
        parsedBody,
        exceptionCtor: SSMServiceException,
        errorCode
      });
  }
};
const deserializeAws_json1_1InternalServerErrorResponse = async (parsedOutput, context) => {
  const body = parsedOutput.body;
  const deserialized = deserializeAws_json1_1InternalServerError(body);
  const exception = new InternalServerError({
    $metadata: deserializeMetadata$3(parsedOutput),
    ...deserialized
  });
  return decorateServiceException(exception, body);
};
const deserializeAws_json1_1InvalidKeyIdResponse = async (parsedOutput, context) => {
  const body = parsedOutput.body;
  const deserialized = deserializeAws_json1_1InvalidKeyId(body);
  const exception = new InvalidKeyId({
    $metadata: deserializeMetadata$3(parsedOutput),
    ...deserialized
  });
  return decorateServiceException(exception, body);
};
const serializeAws_json1_1GetParametersRequest = (input, context) => {
  return {
    ...input.Names != null && { Names: serializeAws_json1_1ParameterNameList(input.Names) },
    ...input.WithDecryption != null && { WithDecryption: input.WithDecryption }
  };
};
const serializeAws_json1_1ParameterNameList = (input, context) => {
  return input.filter((e2) => e2 != null).map((entry) => {
    return entry;
  });
};
const deserializeAws_json1_1GetParametersResult = (output, context) => {
  return {
    InvalidParameters: output.InvalidParameters != null ? deserializeAws_json1_1ParameterNameList(output.InvalidParameters) : void 0,
    Parameters: output.Parameters != null ? deserializeAws_json1_1ParameterList(output.Parameters) : void 0
  };
};
const deserializeAws_json1_1InternalServerError = (output, context) => {
  return {
    Message: expectString(output.Message)
  };
};
const deserializeAws_json1_1InvalidKeyId = (output, context) => {
  return {
    message: expectString(output.message)
  };
};
const deserializeAws_json1_1Parameter = (output, context) => {
  return {
    ARN: expectString(output.ARN),
    DataType: expectString(output.DataType),
    LastModifiedDate: output.LastModifiedDate != null ? expectNonNull(parseEpochTimestamp(expectNumber(output.LastModifiedDate))) : void 0,
    Name: expectString(output.Name),
    Selector: expectString(output.Selector),
    SourceResult: expectString(output.SourceResult),
    Type: expectString(output.Type),
    Value: expectString(output.Value),
    Version: expectLong(output.Version)
  };
};
const deserializeAws_json1_1ParameterList = (output, context) => {
  const retVal = (output || []).filter((e2) => e2 != null).map((entry) => {
    if (entry === null) {
      return null;
    }
    return deserializeAws_json1_1Parameter(entry);
  });
  return retVal;
};
const deserializeAws_json1_1ParameterNameList = (output, context) => {
  const retVal = (output || []).filter((e2) => e2 != null).map((entry) => {
    if (entry === null) {
      return null;
    }
    return expectString(entry);
  });
  return retVal;
};
const deserializeMetadata$3 = (output) => ({
  httpStatusCode: output.statusCode,
  requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
  extendedRequestId: output.headers["x-amz-id-2"],
  cfId: output.headers["x-amz-cf-id"]
});
const collectBody$3 = (streamBody = new Uint8Array(), context) => {
  if (streamBody instanceof Uint8Array) {
    return Promise.resolve(streamBody);
  }
  return context.streamCollector(streamBody) || Promise.resolve(new Uint8Array());
};
const collectBodyString$3 = (streamBody, context) => collectBody$3(streamBody, context).then((body) => context.utf8Encoder(body));
const buildHttpRpcRequest$1 = async (context, headers, path, resolvedHostname, body) => {
  const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
  const contents = {
    protocol,
    hostname,
    port,
    method: "POST",
    path: basePath.endsWith("/") ? basePath.slice(0, -1) + path : basePath + path,
    headers
  };
  if (resolvedHostname !== void 0) {
    contents.hostname = resolvedHostname;
  }
  if (body !== void 0) {
    contents.body = body;
  }
  return new HttpRequest(contents);
};
const parseBody$3 = (streamBody, context) => collectBodyString$3(streamBody, context).then((encoded) => {
  if (encoded.length) {
    return JSON.parse(encoded);
  }
  return {};
});
const parseErrorBody$3 = async (errorBody, context) => {
  const value = await parseBody$3(errorBody, context);
  value.message = value.message ?? value.Message;
  return value;
};
const loadRestJsonErrorCode$2 = (output, data) => {
  const findKey = (object, key) => Object.keys(object).find((k2) => k2.toLowerCase() === key.toLowerCase());
  const sanitizeErrorCode = (rawValue) => {
    let cleanValue = rawValue;
    if (typeof cleanValue === "number") {
      cleanValue = cleanValue.toString();
    }
    if (cleanValue.indexOf(",") >= 0) {
      cleanValue = cleanValue.split(",")[0];
    }
    if (cleanValue.indexOf(":") >= 0) {
      cleanValue = cleanValue.split(":")[0];
    }
    if (cleanValue.indexOf("#") >= 0) {
      cleanValue = cleanValue.split("#")[1];
    }
    return cleanValue;
  };
  const headerKey = findKey(output.headers, "x-amzn-errortype");
  if (headerKey !== void 0) {
    return sanitizeErrorCode(output.headers[headerKey]);
  }
  if (data.code !== void 0) {
    return sanitizeErrorCode(data.code);
  }
  if (data["__type"] !== void 0) {
    return sanitizeErrorCode(data["__type"]);
  }
};
class GetParametersCommand extends Command {
  constructor(input) {
    super();
    this.input = input;
  }
  static getEndpointParameterInstructions() {
    return {
      UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
      Endpoint: { type: "builtInParams", name: "endpoint" },
      Region: { type: "builtInParams", name: "region" },
      UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" }
    };
  }
  resolveMiddleware(clientStack, configuration, options) {
    this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
    this.middlewareStack.use(getEndpointPlugin(configuration, GetParametersCommand.getEndpointParameterInstructions()));
    const stack = clientStack.concat(this.middlewareStack);
    const { logger: logger2 } = configuration;
    const clientName = "SSMClient";
    const commandName = "GetParametersCommand";
    const handlerExecutionContext = {
      logger: logger2,
      clientName,
      commandName,
      inputFilterSensitiveLog: GetParametersRequestFilterSensitiveLog,
      outputFilterSensitiveLog: GetParametersResultFilterSensitiveLog
    };
    const { requestHandler } = configuration;
    return stack.resolve((request2) => requestHandler.handle(request2.request, options || {}), handlerExecutionContext);
  }
  serialize(input, context) {
    return serializeAws_json1_1GetParametersCommand(input, context);
  }
  deserialize(output, context) {
    return deserializeAws_json1_1GetParametersCommand(output, context);
  }
}
var SelectorType;
(function(SelectorType2) {
  SelectorType2["ENV"] = "env";
  SelectorType2["CONFIG"] = "shared config entry";
})(SelectorType || (SelectorType = {}));
const booleanSelector = (obj, key, type) => {
  if (!(key in obj))
    return void 0;
  if (obj[key] === "true")
    return true;
  if (obj[key] === "false")
    return false;
  throw new Error(`Cannot load ${type} "${key}". Expected "true" or "false", got ${obj[key]}.`);
};
const ENV_USE_DUALSTACK_ENDPOINT = "AWS_USE_DUALSTACK_ENDPOINT";
const CONFIG_USE_DUALSTACK_ENDPOINT = "use_dualstack_endpoint";
const NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS = {
  environmentVariableSelector: (env2) => booleanSelector(env2, ENV_USE_DUALSTACK_ENDPOINT, SelectorType.ENV),
  configFileSelector: (profile) => booleanSelector(profile, CONFIG_USE_DUALSTACK_ENDPOINT, SelectorType.CONFIG),
  default: false
};
const ENV_USE_FIPS_ENDPOINT = "AWS_USE_FIPS_ENDPOINT";
const CONFIG_USE_FIPS_ENDPOINT = "use_fips_endpoint";
const NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS = {
  environmentVariableSelector: (env2) => booleanSelector(env2, ENV_USE_FIPS_ENDPOINT, SelectorType.ENV),
  configFileSelector: (profile) => booleanSelector(profile, CONFIG_USE_FIPS_ENDPOINT, SelectorType.CONFIG),
  default: false
};
const REGION_ENV_NAME = "AWS_REGION";
const REGION_INI_NAME = "region";
const NODE_REGION_CONFIG_OPTIONS = {
  environmentVariableSelector: (env2) => env2[REGION_ENV_NAME],
  configFileSelector: (profile) => profile[REGION_INI_NAME],
  default: () => {
    throw new Error("Region is missing");
  }
};
const NODE_REGION_CONFIG_FILE_OPTIONS = {
  preferredFile: "credentials"
};
const isFipsRegion = (region) => typeof region === "string" && (region.startsWith("fips-") || region.endsWith("-fips"));
const getRealRegion = (region) => isFipsRegion(region) ? ["fips-aws-global", "aws-fips"].includes(region) ? "us-east-1" : region.replace(/fips-(dkr-|prod-)?|-fips/, "") : region;
const resolveRegionConfig = (input) => {
  const { region, useFipsEndpoint } = input;
  if (!region) {
    throw new Error("Region is missing");
  }
  return {
    ...input,
    region: async () => {
      if (typeof region === "string") {
        return getRealRegion(region);
      }
      const providedRegion = await region();
      return getRealRegion(providedRegion);
    },
    useFipsEndpoint: async () => {
      const providedRegion = typeof region === "string" ? region : await region();
      if (isFipsRegion(providedRegion)) {
        return true;
      }
      return typeof useFipsEndpoint !== "function" ? Promise.resolve(!!useFipsEndpoint) : useFipsEndpoint();
    }
  };
};
const CONTENT_LENGTH_HEADER = "content-length";
function contentLengthMiddleware(bodyLengthChecker) {
  return (next) => async (args) => {
    const request2 = args.request;
    if (HttpRequest.isInstance(request2)) {
      const { body, headers } = request2;
      if (body && Object.keys(headers).map((str) => str.toLowerCase()).indexOf(CONTENT_LENGTH_HEADER) === -1) {
        try {
          const length = bodyLengthChecker(body);
          request2.headers = {
            ...request2.headers,
            [CONTENT_LENGTH_HEADER]: String(length)
          };
        } catch (error) {
        }
      }
    }
    return next({
      ...args,
      request: request2
    });
  };
}
const contentLengthMiddlewareOptions = {
  step: "build",
  tags: ["SET_CONTENT_LENGTH", "CONTENT_LENGTH"],
  name: "contentLengthMiddleware",
  override: true
};
const getContentLengthPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.add(contentLengthMiddleware(options.bodyLengthChecker), contentLengthMiddlewareOptions);
  }
});
function resolveHostHeaderConfig(input) {
  return input;
}
const hostHeaderMiddleware = (options) => (next) => async (args) => {
  if (!HttpRequest.isInstance(args.request))
    return next(args);
  const { request: request2 } = args;
  const { handlerProtocol = "" } = options.requestHandler.metadata || {};
  if (handlerProtocol.indexOf("h2") >= 0 && !request2.headers[":authority"]) {
    delete request2.headers["host"];
    request2.headers[":authority"] = "";
  } else if (!request2.headers["host"]) {
    let host = request2.hostname;
    if (request2.port != null)
      host += `:${request2.port}`;
    request2.headers["host"] = host;
  }
  return next(args);
};
const hostHeaderMiddlewareOptions = {
  name: "hostHeaderMiddleware",
  step: "build",
  priority: "low",
  tags: ["HOST"],
  override: true
};
const getHostHeaderPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.add(hostHeaderMiddleware(options), hostHeaderMiddlewareOptions);
  }
});
const loggerMiddleware = () => (next, context) => async (args) => {
  const response = await next(args);
  const { clientName, commandName, logger: logger2, inputFilterSensitiveLog, outputFilterSensitiveLog, dynamoDbDocumentClientOptions = {} } = context;
  const { overrideInputFilterSensitiveLog, overrideOutputFilterSensitiveLog } = dynamoDbDocumentClientOptions;
  if (!logger2) {
    return response;
  }
  if (typeof logger2.info === "function") {
    const { $metadata, ...outputWithoutMetadata } = response.output;
    logger2.info({
      clientName,
      commandName,
      input: (overrideInputFilterSensitiveLog ?? inputFilterSensitiveLog)(args.input),
      output: (overrideOutputFilterSensitiveLog ?? outputFilterSensitiveLog)(outputWithoutMetadata),
      metadata: $metadata
    });
  }
  return response;
};
const loggerMiddlewareOptions = {
  name: "loggerMiddleware",
  tags: ["LOGGER"],
  step: "initialize",
  override: true
};
const getLoggerPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.add(loggerMiddleware(), loggerMiddlewareOptions);
  }
});
const TRACE_ID_HEADER_NAME = "X-Amzn-Trace-Id";
const ENV_LAMBDA_FUNCTION_NAME = "AWS_LAMBDA_FUNCTION_NAME";
const ENV_TRACE_ID = "_X_AMZN_TRACE_ID";
const recursionDetectionMiddleware = (options) => (next) => async (args) => {
  const { request: request2 } = args;
  if (!HttpRequest.isInstance(request2) || options.runtime !== "node" || request2.headers.hasOwnProperty(TRACE_ID_HEADER_NAME)) {
    return next(args);
  }
  const functionName = process.env[ENV_LAMBDA_FUNCTION_NAME];
  const traceId = process.env[ENV_TRACE_ID];
  const nonEmptyString = (str) => typeof str === "string" && str.length > 0;
  if (nonEmptyString(functionName) && nonEmptyString(traceId)) {
    request2.headers[TRACE_ID_HEADER_NAME] = traceId;
  }
  return next({
    ...args,
    request: request2
  });
};
const addRecursionDetectionMiddlewareOptions = {
  step: "build",
  tags: ["RECURSION_DETECTION"],
  name: "recursionDetectionMiddleware",
  override: true,
  priority: "low"
};
const getRecursionDetectionPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.add(recursionDetectionMiddleware(options), addRecursionDetectionMiddlewareOptions);
  }
});
var RETRY_MODES;
(function(RETRY_MODES2) {
  RETRY_MODES2["STANDARD"] = "standard";
  RETRY_MODES2["ADAPTIVE"] = "adaptive";
})(RETRY_MODES || (RETRY_MODES = {}));
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_MODE = "STANDARD";
const THROTTLING_ERROR_CODES = [
  "BandwidthLimitExceeded",
  "EC2ThrottledException",
  "LimitExceededException",
  "PriorRequestNotComplete",
  "ProvisionedThroughputExceededException",
  "RequestLimitExceeded",
  "RequestThrottled",
  "RequestThrottledException",
  "SlowDown",
  "ThrottledException",
  "Throttling",
  "ThrottlingException",
  "TooManyRequestsException",
  "TransactionInProgressException"
];
const TRANSIENT_ERROR_CODES = ["AbortError", "TimeoutError", "RequestTimeout", "RequestTimeoutException"];
const TRANSIENT_ERROR_STATUS_CODES = [500, 502, 503, 504];
const NODEJS_TIMEOUT_ERROR_CODES$1 = ["ECONNRESET", "EPIPE", "ETIMEDOUT"];
const isThrottlingError = (error) => error.$metadata?.httpStatusCode === 429 || THROTTLING_ERROR_CODES.includes(error.name) || error.$retryable?.throttling == true;
const isTransientError = (error) => TRANSIENT_ERROR_CODES.includes(error.name) || NODEJS_TIMEOUT_ERROR_CODES$1.includes(error?.code || "") || TRANSIENT_ERROR_STATUS_CODES.includes(error.$metadata?.httpStatusCode || 0);
const isServerError = (error) => {
  if (error.$metadata?.httpStatusCode !== void 0) {
    const statusCode = error.$metadata.httpStatusCode;
    if (500 <= statusCode && statusCode <= 599 && !isTransientError(error)) {
      return true;
    }
    return false;
  }
  return false;
};
class DefaultRateLimiter {
  constructor(options) {
    this.currentCapacity = 0;
    this.enabled = false;
    this.lastMaxRate = 0;
    this.measuredTxRate = 0;
    this.requestCount = 0;
    this.lastTimestamp = 0;
    this.timeWindow = 0;
    this.beta = options?.beta ?? 0.7;
    this.minCapacity = options?.minCapacity ?? 1;
    this.minFillRate = options?.minFillRate ?? 0.5;
    this.scaleConstant = options?.scaleConstant ?? 0.4;
    this.smooth = options?.smooth ?? 0.8;
    const currentTimeInSeconds = this.getCurrentTimeInSeconds();
    this.lastThrottleTime = currentTimeInSeconds;
    this.lastTxRateBucket = Math.floor(this.getCurrentTimeInSeconds());
    this.fillRate = this.minFillRate;
    this.maxCapacity = this.minCapacity;
  }
  getCurrentTimeInSeconds() {
    return Date.now() / 1e3;
  }
  async getSendToken() {
    return this.acquireTokenBucket(1);
  }
  async acquireTokenBucket(amount) {
    if (!this.enabled) {
      return;
    }
    this.refillTokenBucket();
    if (amount > this.currentCapacity) {
      const delay = (amount - this.currentCapacity) / this.fillRate * 1e3;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    this.currentCapacity = this.currentCapacity - amount;
  }
  refillTokenBucket() {
    const timestamp = this.getCurrentTimeInSeconds();
    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
      return;
    }
    const fillAmount = (timestamp - this.lastTimestamp) * this.fillRate;
    this.currentCapacity = Math.min(this.maxCapacity, this.currentCapacity + fillAmount);
    this.lastTimestamp = timestamp;
  }
  updateClientSendingRate(response) {
    let calculatedRate;
    this.updateMeasuredRate();
    if (isThrottlingError(response)) {
      const rateToUse = !this.enabled ? this.measuredTxRate : Math.min(this.measuredTxRate, this.fillRate);
      this.lastMaxRate = rateToUse;
      this.calculateTimeWindow();
      this.lastThrottleTime = this.getCurrentTimeInSeconds();
      calculatedRate = this.cubicThrottle(rateToUse);
      this.enableTokenBucket();
    } else {
      this.calculateTimeWindow();
      calculatedRate = this.cubicSuccess(this.getCurrentTimeInSeconds());
    }
    const newRate = Math.min(calculatedRate, 2 * this.measuredTxRate);
    this.updateTokenBucketRate(newRate);
  }
  calculateTimeWindow() {
    this.timeWindow = this.getPrecise(Math.pow(this.lastMaxRate * (1 - this.beta) / this.scaleConstant, 1 / 3));
  }
  cubicThrottle(rateToUse) {
    return this.getPrecise(rateToUse * this.beta);
  }
  cubicSuccess(timestamp) {
    return this.getPrecise(this.scaleConstant * Math.pow(timestamp - this.lastThrottleTime - this.timeWindow, 3) + this.lastMaxRate);
  }
  enableTokenBucket() {
    this.enabled = true;
  }
  updateTokenBucketRate(newRate) {
    this.refillTokenBucket();
    this.fillRate = Math.max(newRate, this.minFillRate);
    this.maxCapacity = Math.max(newRate, this.minCapacity);
    this.currentCapacity = Math.min(this.currentCapacity, this.maxCapacity);
  }
  updateMeasuredRate() {
    const t2 = this.getCurrentTimeInSeconds();
    const timeBucket = Math.floor(t2 * 2) / 2;
    this.requestCount++;
    if (timeBucket > this.lastTxRateBucket) {
      const currentRate = this.requestCount / (timeBucket - this.lastTxRateBucket);
      this.measuredTxRate = this.getPrecise(currentRate * this.smooth + this.measuredTxRate * (1 - this.smooth));
      this.requestCount = 0;
      this.lastTxRateBucket = timeBucket;
    }
  }
  getPrecise(num) {
    return parseFloat(num.toFixed(8));
  }
}
const DEFAULT_RETRY_DELAY_BASE = 100;
const MAXIMUM_RETRY_DELAY = 20 * 1e3;
const THROTTLING_RETRY_DELAY_BASE = 500;
const INITIAL_RETRY_TOKENS = 500;
const RETRY_COST = 5;
const TIMEOUT_RETRY_COST = 10;
const NO_RETRY_INCREMENT = 1;
const INVOCATION_ID_HEADER = "amz-sdk-invocation-id";
const REQUEST_HEADER = "amz-sdk-request";
const getDefaultRetryBackoffStrategy = () => {
  let delayBase = DEFAULT_RETRY_DELAY_BASE;
  const computeNextBackoffDelay = (attempts) => {
    return Math.floor(Math.min(MAXIMUM_RETRY_DELAY, Math.random() * 2 ** attempts * delayBase));
  };
  const setDelayBase = (delay) => {
    delayBase = delay;
  };
  return {
    computeNextBackoffDelay,
    setDelayBase
  };
};
const getDefaultRetryToken = (initialRetryTokens, initialRetryDelay, initialRetryCount, options) => {
  const MAX_CAPACITY = initialRetryTokens;
  const retryCost = options?.retryCost ?? RETRY_COST;
  const timeoutRetryCost = options?.timeoutRetryCost ?? TIMEOUT_RETRY_COST;
  const retryBackoffStrategy = options?.retryBackoffStrategy ?? getDefaultRetryBackoffStrategy();
  let availableCapacity = initialRetryTokens;
  let retryDelay = Math.min(MAXIMUM_RETRY_DELAY, initialRetryDelay);
  let lastRetryCost = void 0;
  let retryCount = initialRetryCount ?? 0;
  const getCapacityAmount = (errorType) => errorType === "TRANSIENT" ? timeoutRetryCost : retryCost;
  const getRetryCount = () => retryCount;
  const getRetryDelay = () => retryDelay;
  const getLastRetryCost = () => lastRetryCost;
  const hasRetryTokens = (errorType) => getCapacityAmount(errorType) <= availableCapacity;
  const getRetryTokenCount = (errorInfo) => {
    const errorType = errorInfo.errorType;
    if (!hasRetryTokens(errorType)) {
      throw new Error("No retry token available");
    }
    const capacityAmount = getCapacityAmount(errorType);
    const delayBase = errorType === "THROTTLING" ? THROTTLING_RETRY_DELAY_BASE : DEFAULT_RETRY_DELAY_BASE;
    retryBackoffStrategy.setDelayBase(delayBase);
    const delayFromErrorType = retryBackoffStrategy.computeNextBackoffDelay(retryCount);
    if (errorInfo.retryAfterHint) {
      const delayFromRetryAfterHint = errorInfo.retryAfterHint.getTime() - Date.now();
      retryDelay = Math.max(delayFromRetryAfterHint || 0, delayFromErrorType);
    } else {
      retryDelay = delayFromErrorType;
    }
    retryCount++;
    lastRetryCost = capacityAmount;
    availableCapacity -= capacityAmount;
    return capacityAmount;
  };
  const releaseRetryTokens = (releaseAmount) => {
    availableCapacity += releaseAmount ?? NO_RETRY_INCREMENT;
    availableCapacity = Math.min(availableCapacity, MAX_CAPACITY);
  };
  return {
    getRetryCount,
    getRetryDelay,
    getLastRetryCost,
    hasRetryTokens,
    getRetryTokenCount,
    releaseRetryTokens
  };
};
class StandardRetryStrategy {
  constructor(maxAttemptsProvider) {
    this.maxAttemptsProvider = maxAttemptsProvider;
    this.mode = RETRY_MODES.STANDARD;
    this.retryToken = getDefaultRetryToken(INITIAL_RETRY_TOKENS, DEFAULT_RETRY_DELAY_BASE);
    this.maxAttemptsProvider = maxAttemptsProvider;
  }
  async acquireInitialRetryToken(retryTokenScope) {
    return this.retryToken;
  }
  async refreshRetryTokenForRetry(tokenToRenew, errorInfo) {
    const maxAttempts = await this.getMaxAttempts();
    if (this.shouldRetry(tokenToRenew, errorInfo, maxAttempts)) {
      tokenToRenew.getRetryTokenCount(errorInfo);
      return tokenToRenew;
    }
    throw new Error("No retry token available");
  }
  recordSuccess(token) {
    this.retryToken.releaseRetryTokens(token.getLastRetryCost());
  }
  async getMaxAttempts() {
    try {
      return await this.maxAttemptsProvider();
    } catch (error) {
      console.warn(`Max attempts provider could not resolve. Using default of ${DEFAULT_MAX_ATTEMPTS}`);
      return DEFAULT_MAX_ATTEMPTS;
    }
  }
  shouldRetry(tokenToRenew, errorInfo, maxAttempts) {
    const attempts = tokenToRenew.getRetryCount();
    return attempts < maxAttempts && tokenToRenew.hasRetryTokens(errorInfo.errorType) && this.isRetryableError(errorInfo.errorType);
  }
  isRetryableError(errorType) {
    return errorType === "THROTTLING" || errorType === "TRANSIENT";
  }
}
class AdaptiveRetryStrategy {
  constructor(maxAttemptsProvider, options) {
    this.maxAttemptsProvider = maxAttemptsProvider;
    this.mode = RETRY_MODES.ADAPTIVE;
    const { rateLimiter } = options ?? {};
    this.rateLimiter = rateLimiter ?? new DefaultRateLimiter();
    this.standardRetryStrategy = new StandardRetryStrategy(maxAttemptsProvider);
  }
  async acquireInitialRetryToken(retryTokenScope) {
    await this.rateLimiter.getSendToken();
    return this.standardRetryStrategy.acquireInitialRetryToken(retryTokenScope);
  }
  async refreshRetryTokenForRetry(tokenToRenew, errorInfo) {
    this.rateLimiter.updateClientSendingRate(errorInfo);
    return this.standardRetryStrategy.refreshRetryTokenForRetry(tokenToRenew, errorInfo);
  }
  recordSuccess(token) {
    this.rateLimiter.updateClientSendingRate({});
    this.standardRetryStrategy.recordSuccess(token);
  }
}
const asSdkError = (error) => {
  if (error instanceof Error)
    return error;
  if (error instanceof Object)
    return Object.assign(new Error(), error);
  if (typeof error === "string")
    return new Error(error);
  return new Error(`AWS SDK error wrapper for ${error}`);
};
const ENV_MAX_ATTEMPTS = "AWS_MAX_ATTEMPTS";
const CONFIG_MAX_ATTEMPTS = "max_attempts";
const NODE_MAX_ATTEMPT_CONFIG_OPTIONS = {
  environmentVariableSelector: (env2) => {
    const value = env2[ENV_MAX_ATTEMPTS];
    if (!value)
      return void 0;
    const maxAttempt = parseInt(value);
    if (Number.isNaN(maxAttempt)) {
      throw new Error(`Environment variable ${ENV_MAX_ATTEMPTS} mast be a number, got "${value}"`);
    }
    return maxAttempt;
  },
  configFileSelector: (profile) => {
    const value = profile[CONFIG_MAX_ATTEMPTS];
    if (!value)
      return void 0;
    const maxAttempt = parseInt(value);
    if (Number.isNaN(maxAttempt)) {
      throw new Error(`Shared config file entry ${CONFIG_MAX_ATTEMPTS} mast be a number, got "${value}"`);
    }
    return maxAttempt;
  },
  default: DEFAULT_MAX_ATTEMPTS
};
const resolveRetryConfig = (input) => {
  const { retryStrategy } = input;
  const maxAttempts = normalizeProvider(input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  return {
    ...input,
    maxAttempts,
    retryStrategy: async () => {
      if (retryStrategy) {
        return retryStrategy;
      }
      const retryMode = await normalizeProvider(input.retryMode)();
      if (retryMode === RETRY_MODES.ADAPTIVE) {
        return new AdaptiveRetryStrategy(maxAttempts);
      }
      return new StandardRetryStrategy(maxAttempts);
    }
  };
};
const ENV_RETRY_MODE = "AWS_RETRY_MODE";
const CONFIG_RETRY_MODE = "retry_mode";
const NODE_RETRY_MODE_CONFIG_OPTIONS = {
  environmentVariableSelector: (env2) => env2[ENV_RETRY_MODE],
  configFileSelector: (profile) => profile[CONFIG_RETRY_MODE],
  default: DEFAULT_RETRY_MODE
};
const retryMiddleware = (options) => (next, context) => async (args) => {
  let retryStrategy = await options.retryStrategy();
  const maxAttempts = await options.maxAttempts();
  if (isRetryStrategyV2(retryStrategy)) {
    retryStrategy = retryStrategy;
    let retryToken = await retryStrategy.acquireInitialRetryToken(context["partition_id"]);
    let lastError = new Error();
    let attempts = 0;
    let totalRetryDelay = 0;
    const { request: request2 } = args;
    if (HttpRequest.isInstance(request2)) {
      request2.headers[INVOCATION_ID_HEADER] = v4();
    }
    while (true) {
      try {
        if (HttpRequest.isInstance(request2)) {
          request2.headers[REQUEST_HEADER] = `attempt=${attempts + 1}; max=${maxAttempts}`;
        }
        const { response, output } = await next(args);
        retryStrategy.recordSuccess(retryToken);
        output.$metadata.attempts = attempts + 1;
        output.$metadata.totalRetryDelay = totalRetryDelay;
        return { response, output };
      } catch (e2) {
        const retryErrorInfo = getRetyErrorInto(e2);
        lastError = asSdkError(e2);
        try {
          retryToken = await retryStrategy.refreshRetryTokenForRetry(retryToken, retryErrorInfo);
        } catch (refreshError) {
          if (!lastError.$metadata) {
            lastError.$metadata = {};
          }
          lastError.$metadata.attempts = attempts + 1;
          lastError.$metadata.totalRetryDelay = totalRetryDelay;
          throw lastError;
        }
        attempts = retryToken.getRetryCount();
        const delay = retryToken.getRetryDelay();
        totalRetryDelay += delay;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  } else {
    retryStrategy = retryStrategy;
    if (retryStrategy?.mode)
      context.userAgent = [...context.userAgent || [], ["cfg/retry-mode", retryStrategy.mode]];
    return retryStrategy.retry(next, args);
  }
};
const isRetryStrategyV2 = (retryStrategy) => typeof retryStrategy.acquireInitialRetryToken !== "undefined" && typeof retryStrategy.refreshRetryTokenForRetry !== "undefined" && typeof retryStrategy.recordSuccess !== "undefined";
const getRetyErrorInto = (error) => {
  const errorInfo = {
    errorType: getRetryErrorType(error)
  };
  const retryAfterHint = getRetryAfterHint(error.$response);
  if (retryAfterHint) {
    errorInfo.retryAfterHint = retryAfterHint;
  }
  return errorInfo;
};
const getRetryErrorType = (error) => {
  if (isThrottlingError(error))
    return "THROTTLING";
  if (isTransientError(error))
    return "TRANSIENT";
  if (isServerError(error))
    return "SERVER_ERROR";
  return "CLIENT_ERROR";
};
const retryMiddlewareOptions = {
  name: "retryMiddleware",
  tags: ["RETRY"],
  step: "finalizeRequest",
  priority: "high",
  override: true
};
const getRetryPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.add(retryMiddleware(options), retryMiddlewareOptions);
  }
});
const getRetryAfterHint = (response) => {
  if (!HttpResponse.isInstance(response))
    return;
  const retryAfterHeaderName = Object.keys(response.headers).find((key) => key.toLowerCase() === "retry-after");
  if (!retryAfterHeaderName)
    return;
  const retryAfter = response.headers[retryAfterHeaderName];
  const retryAfterSeconds = Number(retryAfter);
  if (!Number.isNaN(retryAfterSeconds))
    return new Date(retryAfterSeconds * 1e3);
  const retryAfterDate = new Date(retryAfter);
  return retryAfterDate;
};
class ProviderError extends Error {
  constructor(message, tryNextLink = true) {
    super(message);
    this.tryNextLink = tryNextLink;
    this.name = "ProviderError";
    Object.setPrototypeOf(this, ProviderError.prototype);
  }
  static from(error, tryNextLink = true) {
    return Object.assign(new this(error.message, tryNextLink), error);
  }
}
class CredentialsProviderError extends ProviderError {
  constructor(message, tryNextLink = true) {
    super(message, tryNextLink);
    this.tryNextLink = tryNextLink;
    this.name = "CredentialsProviderError";
    Object.setPrototypeOf(this, CredentialsProviderError.prototype);
  }
}
class TokenProviderError extends ProviderError {
  constructor(message, tryNextLink = true) {
    super(message, tryNextLink);
    this.tryNextLink = tryNextLink;
    this.name = "TokenProviderError";
    Object.setPrototypeOf(this, TokenProviderError.prototype);
  }
}
function chain(...providers) {
  return () => {
    let promise = Promise.reject(new ProviderError("No providers in chain"));
    for (const provider of providers) {
      promise = promise.catch((err) => {
        if (err?.tryNextLink) {
          return provider();
        }
        throw err;
      });
    }
    return promise;
  };
}
const fromStatic$1 = (staticValue) => () => Promise.resolve(staticValue);
const memoize = (provider, isExpired, requiresRefresh) => {
  let resolved;
  let pending;
  let hasResult;
  let isConstant = false;
  const coalesceProvider = async () => {
    if (!pending) {
      pending = provider();
    }
    try {
      resolved = await pending;
      hasResult = true;
      isConstant = false;
    } finally {
      pending = void 0;
    }
    return resolved;
  };
  if (isExpired === void 0) {
    return async (options) => {
      if (!hasResult || options?.forceRefresh) {
        resolved = await coalesceProvider();
      }
      return resolved;
    };
  }
  return async (options) => {
    if (!hasResult || options?.forceRefresh) {
      resolved = await coalesceProvider();
    }
    if (isConstant) {
      return resolved;
    }
    if (requiresRefresh && !requiresRefresh(resolved)) {
      isConstant = true;
      return resolved;
    }
    if (isExpired(resolved)) {
      await coalesceProvider();
      return resolved;
    }
    return resolved;
  };
};
const SHORT_TO_HEX = {};
for (let i2 = 0; i2 < 256; i2++) {
  let encodedByte = i2.toString(16).toLowerCase();
  if (encodedByte.length === 1) {
    encodedByte = `0${encodedByte}`;
  }
  SHORT_TO_HEX[i2] = encodedByte;
}
function toHex(bytes) {
  let out = "";
  for (let i2 = 0; i2 < bytes.byteLength; i2++) {
    out += SHORT_TO_HEX[bytes[i2]];
  }
  return out;
}
const isArrayBuffer = (arg) => typeof ArrayBuffer === "function" && arg instanceof ArrayBuffer || Object.prototype.toString.call(arg) === "[object ArrayBuffer]";
const fromArrayBuffer = (input, offset = 0, length = input.byteLength - offset) => {
  if (!isArrayBuffer(input)) {
    throw new TypeError(`The "input" argument must be ArrayBuffer. Received type ${typeof input} (${input})`);
  }
  return Buffer$1.from(input, offset, length);
};
const fromString = (input, encoding) => {
  if (typeof input !== "string") {
    throw new TypeError(`The "input" argument must be of type string. Received type ${typeof input} (${input})`);
  }
  return encoding ? Buffer$1.from(input, encoding) : Buffer$1.from(input);
};
const fromUtf8 = (input) => {
  const buf = fromString(input, "utf8");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength / Uint8Array.BYTES_PER_ELEMENT);
};
const toUint8Array = (data) => {
  if (typeof data === "string") {
    return fromUtf8(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
  }
  return new Uint8Array(data);
};
const toUtf8 = (input) => fromArrayBuffer(input.buffer, input.byteOffset, input.byteLength).toString("utf8");
const ALGORITHM_QUERY_PARAM = "X-Amz-Algorithm";
const CREDENTIAL_QUERY_PARAM = "X-Amz-Credential";
const AMZ_DATE_QUERY_PARAM = "X-Amz-Date";
const SIGNED_HEADERS_QUERY_PARAM = "X-Amz-SignedHeaders";
const EXPIRES_QUERY_PARAM = "X-Amz-Expires";
const SIGNATURE_QUERY_PARAM = "X-Amz-Signature";
const TOKEN_QUERY_PARAM = "X-Amz-Security-Token";
const AUTH_HEADER = "authorization";
const AMZ_DATE_HEADER = AMZ_DATE_QUERY_PARAM.toLowerCase();
const DATE_HEADER = "date";
const GENERATED_HEADERS = [AUTH_HEADER, AMZ_DATE_HEADER, DATE_HEADER];
const SIGNATURE_HEADER = SIGNATURE_QUERY_PARAM.toLowerCase();
const SHA256_HEADER = "x-amz-content-sha256";
const TOKEN_HEADER = TOKEN_QUERY_PARAM.toLowerCase();
const ALWAYS_UNSIGNABLE_HEADERS = {
  authorization: true,
  "cache-control": true,
  connection: true,
  expect: true,
  from: true,
  "keep-alive": true,
  "max-forwards": true,
  pragma: true,
  referer: true,
  te: true,
  trailer: true,
  "transfer-encoding": true,
  upgrade: true,
  "user-agent": true,
  "x-amzn-trace-id": true
};
const PROXY_HEADER_PATTERN = /^proxy-/;
const SEC_HEADER_PATTERN = /^sec-/;
const ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256";
const EVENT_ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256-PAYLOAD";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
const MAX_CACHE_SIZE = 50;
const KEY_TYPE_IDENTIFIER = "aws4_request";
const MAX_PRESIGNED_TTL = 60 * 60 * 24 * 7;
const signingKeyCache = {};
const cacheQueue = [];
const createScope = (shortDate, region, service) => `${shortDate}/${region}/${service}/${KEY_TYPE_IDENTIFIER}`;
const getSigningKey = async (sha256Constructor, credentials, shortDate, region, service) => {
  const credsHash = await hmac(sha256Constructor, credentials.secretAccessKey, credentials.accessKeyId);
  const cacheKey = `${shortDate}:${region}:${service}:${toHex(credsHash)}:${credentials.sessionToken}`;
  if (cacheKey in signingKeyCache) {
    return signingKeyCache[cacheKey];
  }
  cacheQueue.push(cacheKey);
  while (cacheQueue.length > MAX_CACHE_SIZE) {
    delete signingKeyCache[cacheQueue.shift()];
  }
  let key = `AWS4${credentials.secretAccessKey}`;
  for (const signable of [shortDate, region, service, KEY_TYPE_IDENTIFIER]) {
    key = await hmac(sha256Constructor, key, signable);
  }
  return signingKeyCache[cacheKey] = key;
};
const hmac = (ctor, secret, data) => {
  const hash = new ctor(secret);
  hash.update(toUint8Array(data));
  return hash.digest();
};
const getCanonicalHeaders = ({ headers }, unsignableHeaders, signableHeaders) => {
  const canonical = {};
  for (const headerName of Object.keys(headers).sort()) {
    if (headers[headerName] == void 0) {
      continue;
    }
    const canonicalHeaderName = headerName.toLowerCase();
    if (canonicalHeaderName in ALWAYS_UNSIGNABLE_HEADERS || unsignableHeaders?.has(canonicalHeaderName) || PROXY_HEADER_PATTERN.test(canonicalHeaderName) || SEC_HEADER_PATTERN.test(canonicalHeaderName)) {
      if (!signableHeaders || signableHeaders && !signableHeaders.has(canonicalHeaderName)) {
        continue;
      }
    }
    canonical[canonicalHeaderName] = headers[headerName].trim().replace(/\s+/g, " ");
  }
  return canonical;
};
const escapeUri = (uri) => encodeURIComponent(uri).replace(/[!'()*]/g, hexEncode);
const hexEncode = (c2) => `%${c2.charCodeAt(0).toString(16).toUpperCase()}`;
const getCanonicalQuery = ({ query = {} }) => {
  const keys = [];
  const serialized = {};
  for (const key of Object.keys(query).sort()) {
    if (key.toLowerCase() === SIGNATURE_HEADER) {
      continue;
    }
    keys.push(key);
    const value = query[key];
    if (typeof value === "string") {
      serialized[key] = `${escapeUri(key)}=${escapeUri(value)}`;
    } else if (Array.isArray(value)) {
      serialized[key] = value.slice(0).sort().reduce((encoded, value2) => encoded.concat([`${escapeUri(key)}=${escapeUri(value2)}`]), []).join("&");
    }
  }
  return keys.map((key) => serialized[key]).filter((serialized2) => serialized2).join("&");
};
const getPayloadHash = async ({ headers, body }, hashConstructor) => {
  for (const headerName of Object.keys(headers)) {
    if (headerName.toLowerCase() === SHA256_HEADER) {
      return headers[headerName];
    }
  }
  if (body == void 0) {
    return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  } else if (typeof body === "string" || ArrayBuffer.isView(body) || isArrayBuffer(body)) {
    const hashCtor = new hashConstructor();
    hashCtor.update(toUint8Array(body));
    return toHex(await hashCtor.digest());
  }
  return UNSIGNED_PAYLOAD;
};
const hasHeader = (soughtHeader, headers) => {
  soughtHeader = soughtHeader.toLowerCase();
  for (const headerName of Object.keys(headers)) {
    if (soughtHeader === headerName.toLowerCase()) {
      return true;
    }
  }
  return false;
};
const cloneRequest = ({ headers, query, ...rest }) => ({
  ...rest,
  headers: { ...headers },
  query: query ? cloneQuery(query) : void 0
});
const cloneQuery = (query) => Object.keys(query).reduce((carry, paramName) => {
  const param = query[paramName];
  return {
    ...carry,
    [paramName]: Array.isArray(param) ? [...param] : param
  };
}, {});
const moveHeadersToQuery = (request2, options = {}) => {
  const { headers, query = {} } = typeof request2.clone === "function" ? request2.clone() : cloneRequest(request2);
  for (const name2 of Object.keys(headers)) {
    const lname = name2.toLowerCase();
    if (lname.slice(0, 6) === "x-amz-" && !options.unhoistableHeaders?.has(lname)) {
      query[name2] = headers[name2];
      delete headers[name2];
    }
  }
  return {
    ...request2,
    headers,
    query
  };
};
const prepareRequest = (request2) => {
  request2 = typeof request2.clone === "function" ? request2.clone() : cloneRequest(request2);
  for (const headerName of Object.keys(request2.headers)) {
    if (GENERATED_HEADERS.indexOf(headerName.toLowerCase()) > -1) {
      delete request2.headers[headerName];
    }
  }
  return request2;
};
const iso8601 = (time) => toDate(time).toISOString().replace(/\.\d{3}Z$/, "Z");
const toDate = (time) => {
  if (typeof time === "number") {
    return new Date(time * 1e3);
  }
  if (typeof time === "string") {
    if (Number(time)) {
      return new Date(Number(time) * 1e3);
    }
    return new Date(time);
  }
  return time;
};
class SignatureV4 {
  constructor({ applyChecksum, credentials, region, service, sha256, uriEscapePath = true }) {
    this.service = service;
    this.sha256 = sha256;
    this.uriEscapePath = uriEscapePath;
    this.applyChecksum = typeof applyChecksum === "boolean" ? applyChecksum : true;
    this.regionProvider = normalizeProvider(region);
    this.credentialProvider = normalizeProvider(credentials);
  }
  async presign(originalRequest, options = {}) {
    const { signingDate = /* @__PURE__ */ new Date(), expiresIn = 3600, unsignableHeaders, unhoistableHeaders, signableHeaders, signingRegion, signingService } = options;
    const credentials = await this.credentialProvider();
    this.validateResolvedCredentials(credentials);
    const region = signingRegion ?? await this.regionProvider();
    const { longDate, shortDate } = formatDate(signingDate);
    if (expiresIn > MAX_PRESIGNED_TTL) {
      return Promise.reject("Signature version 4 presigned URLs must have an expiration date less than one week in the future");
    }
    const scope = createScope(shortDate, region, signingService ?? this.service);
    const request2 = moveHeadersToQuery(prepareRequest(originalRequest), { unhoistableHeaders });
    if (credentials.sessionToken) {
      request2.query[TOKEN_QUERY_PARAM] = credentials.sessionToken;
    }
    request2.query[ALGORITHM_QUERY_PARAM] = ALGORITHM_IDENTIFIER;
    request2.query[CREDENTIAL_QUERY_PARAM] = `${credentials.accessKeyId}/${scope}`;
    request2.query[AMZ_DATE_QUERY_PARAM] = longDate;
    request2.query[EXPIRES_QUERY_PARAM] = expiresIn.toString(10);
    const canonicalHeaders = getCanonicalHeaders(request2, unsignableHeaders, signableHeaders);
    request2.query[SIGNED_HEADERS_QUERY_PARAM] = getCanonicalHeaderList(canonicalHeaders);
    request2.query[SIGNATURE_QUERY_PARAM] = await this.getSignature(longDate, scope, this.getSigningKey(credentials, region, shortDate, signingService), this.createCanonicalRequest(request2, canonicalHeaders, await getPayloadHash(originalRequest, this.sha256)));
    return request2;
  }
  async sign(toSign, options) {
    if (typeof toSign === "string") {
      return this.signString(toSign, options);
    } else if (toSign.headers && toSign.payload) {
      return this.signEvent(toSign, options);
    } else {
      return this.signRequest(toSign, options);
    }
  }
  async signEvent({ headers, payload }, { signingDate = /* @__PURE__ */ new Date(), priorSignature, signingRegion, signingService }) {
    const region = signingRegion ?? await this.regionProvider();
    const { shortDate, longDate } = formatDate(signingDate);
    const scope = createScope(shortDate, region, signingService ?? this.service);
    const hashedPayload = await getPayloadHash({ headers: {}, body: payload }, this.sha256);
    const hash = new this.sha256();
    hash.update(headers);
    const hashedHeaders = toHex(await hash.digest());
    const stringToSign = [
      EVENT_ALGORITHM_IDENTIFIER,
      longDate,
      scope,
      priorSignature,
      hashedHeaders,
      hashedPayload
    ].join("\n");
    return this.signString(stringToSign, { signingDate, signingRegion: region, signingService });
  }
  async signString(stringToSign, { signingDate = /* @__PURE__ */ new Date(), signingRegion, signingService } = {}) {
    const credentials = await this.credentialProvider();
    this.validateResolvedCredentials(credentials);
    const region = signingRegion ?? await this.regionProvider();
    const { shortDate } = formatDate(signingDate);
    const hash = new this.sha256(await this.getSigningKey(credentials, region, shortDate, signingService));
    hash.update(toUint8Array(stringToSign));
    return toHex(await hash.digest());
  }
  async signRequest(requestToSign, { signingDate = /* @__PURE__ */ new Date(), signableHeaders, unsignableHeaders, signingRegion, signingService } = {}) {
    const credentials = await this.credentialProvider();
    this.validateResolvedCredentials(credentials);
    const region = signingRegion ?? await this.regionProvider();
    const request2 = prepareRequest(requestToSign);
    const { longDate, shortDate } = formatDate(signingDate);
    const scope = createScope(shortDate, region, signingService ?? this.service);
    request2.headers[AMZ_DATE_HEADER] = longDate;
    if (credentials.sessionToken) {
      request2.headers[TOKEN_HEADER] = credentials.sessionToken;
    }
    const payloadHash = await getPayloadHash(request2, this.sha256);
    if (!hasHeader(SHA256_HEADER, request2.headers) && this.applyChecksum) {
      request2.headers[SHA256_HEADER] = payloadHash;
    }
    const canonicalHeaders = getCanonicalHeaders(request2, unsignableHeaders, signableHeaders);
    const signature = await this.getSignature(longDate, scope, this.getSigningKey(credentials, region, shortDate, signingService), this.createCanonicalRequest(request2, canonicalHeaders, payloadHash));
    request2.headers[AUTH_HEADER] = `${ALGORITHM_IDENTIFIER} Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${getCanonicalHeaderList(canonicalHeaders)}, Signature=${signature}`;
    return request2;
  }
  createCanonicalRequest(request2, canonicalHeaders, payloadHash) {
    const sortedHeaders = Object.keys(canonicalHeaders).sort();
    return `${request2.method}
${this.getCanonicalPath(request2)}
${getCanonicalQuery(request2)}
${sortedHeaders.map((name2) => `${name2}:${canonicalHeaders[name2]}`).join("\n")}

${sortedHeaders.join(";")}
${payloadHash}`;
  }
  async createStringToSign(longDate, credentialScope, canonicalRequest) {
    const hash = new this.sha256();
    hash.update(toUint8Array(canonicalRequest));
    const hashedRequest = await hash.digest();
    return `${ALGORITHM_IDENTIFIER}
${longDate}
${credentialScope}
${toHex(hashedRequest)}`;
  }
  getCanonicalPath({ path }) {
    if (this.uriEscapePath) {
      const normalizedPathSegments = [];
      for (const pathSegment of path.split("/")) {
        if (pathSegment?.length === 0)
          continue;
        if (pathSegment === ".")
          continue;
        if (pathSegment === "..") {
          normalizedPathSegments.pop();
        } else {
          normalizedPathSegments.push(pathSegment);
        }
      }
      const normalizedPath = `${path?.startsWith("/") ? "/" : ""}${normalizedPathSegments.join("/")}${normalizedPathSegments.length > 0 && path?.endsWith("/") ? "/" : ""}`;
      const doubleEncoded = encodeURIComponent(normalizedPath);
      return doubleEncoded.replace(/%2F/g, "/");
    }
    return path;
  }
  async getSignature(longDate, credentialScope, keyPromise, canonicalRequest) {
    const stringToSign = await this.createStringToSign(longDate, credentialScope, canonicalRequest);
    const hash = new this.sha256(await keyPromise);
    hash.update(toUint8Array(stringToSign));
    return toHex(await hash.digest());
  }
  getSigningKey(credentials, region, shortDate, service) {
    return getSigningKey(this.sha256, credentials, shortDate, region, service || this.service);
  }
  validateResolvedCredentials(credentials) {
    if (typeof credentials !== "object" || typeof credentials.accessKeyId !== "string" || typeof credentials.secretAccessKey !== "string") {
      throw new Error("Resolved credential object is not valid");
    }
  }
}
const formatDate = (now) => {
  const longDate = iso8601(now).replace(/[\-:]/g, "");
  return {
    longDate,
    shortDate: longDate.slice(0, 8)
  };
};
const getCanonicalHeaderList = (headers) => Object.keys(headers).sort().join(";");
const CREDENTIAL_EXPIRE_WINDOW = 3e5;
const resolveAwsAuthConfig = (input) => {
  const normalizedCreds = input.credentials ? normalizeCredentialProvider(input.credentials) : input.credentialDefaultProvider(input);
  const { signingEscapePath = true, systemClockOffset = input.systemClockOffset || 0, sha256 } = input;
  let signer;
  if (input.signer) {
    signer = normalizeProvider(input.signer);
  } else if (input.regionInfoProvider) {
    signer = () => normalizeProvider(input.region)().then(async (region) => [
      await input.regionInfoProvider(region, {
        useFipsEndpoint: await input.useFipsEndpoint(),
        useDualstackEndpoint: await input.useDualstackEndpoint()
      }) || {},
      region
    ]).then(([regionInfo, region]) => {
      const { signingRegion, signingService } = regionInfo;
      input.signingRegion = input.signingRegion || signingRegion || region;
      input.signingName = input.signingName || signingService || input.serviceId;
      const params = {
        ...input,
        credentials: normalizedCreds,
        region: input.signingRegion,
        service: input.signingName,
        sha256,
        uriEscapePath: signingEscapePath
      };
      const SignerCtor = input.signerConstructor || SignatureV4;
      return new SignerCtor(params);
    });
  } else {
    signer = async (authScheme) => {
      authScheme = Object.assign({}, {
        name: "sigv4",
        signingName: input.signingName || input.defaultSigningName,
        signingRegion: await normalizeProvider(input.region)(),
        properties: {}
      }, authScheme);
      const signingRegion = authScheme.signingRegion;
      const signingService = authScheme.signingName;
      input.signingRegion = input.signingRegion || signingRegion;
      input.signingName = input.signingName || signingService || input.serviceId;
      const params = {
        ...input,
        credentials: normalizedCreds,
        region: input.signingRegion,
        service: input.signingName,
        sha256,
        uriEscapePath: signingEscapePath
      };
      const SignerCtor = input.signerConstructor || SignatureV4;
      return new SignerCtor(params);
    };
  }
  return {
    ...input,
    systemClockOffset,
    signingEscapePath,
    credentials: normalizedCreds,
    signer
  };
};
const normalizeCredentialProvider = (credentials) => {
  if (typeof credentials === "function") {
    return memoize(credentials, (credentials2) => credentials2.expiration !== void 0 && credentials2.expiration.getTime() - Date.now() < CREDENTIAL_EXPIRE_WINDOW, (credentials2) => credentials2.expiration !== void 0);
  }
  return normalizeProvider(credentials);
};
const getSkewCorrectedDate = (systemClockOffset) => new Date(Date.now() + systemClockOffset);
const isClockSkewed = (clockTime, systemClockOffset) => Math.abs(getSkewCorrectedDate(systemClockOffset).getTime() - clockTime) >= 3e5;
const getUpdatedSystemClockOffset = (clockTime, currentSystemClockOffset) => {
  const clockTimeInMs = Date.parse(clockTime);
  if (isClockSkewed(clockTimeInMs, currentSystemClockOffset)) {
    return clockTimeInMs - Date.now();
  }
  return currentSystemClockOffset;
};
const awsAuthMiddleware = (options) => (next, context) => async function(args) {
  if (!HttpRequest.isInstance(args.request))
    return next(args);
  const authScheme = context.endpointV2?.properties?.authSchemes?.[0];
  const multiRegionOverride = authScheme?.name === "sigv4a" ? authScheme?.signingRegionSet?.join(",") : void 0;
  const signer = await options.signer(authScheme);
  const output = await next({
    ...args,
    request: await signer.sign(args.request, {
      signingDate: getSkewCorrectedDate(options.systemClockOffset),
      signingRegion: multiRegionOverride || context["signing_region"],
      signingService: context["signing_service"]
    })
  }).catch((error) => {
    const serverTime = error.ServerTime ?? getDateHeader(error.$response);
    if (serverTime) {
      options.systemClockOffset = getUpdatedSystemClockOffset(serverTime, options.systemClockOffset);
    }
    throw error;
  });
  const dateHeader = getDateHeader(output.response);
  if (dateHeader) {
    options.systemClockOffset = getUpdatedSystemClockOffset(dateHeader, options.systemClockOffset);
  }
  return output;
};
const getDateHeader = (response) => HttpResponse.isInstance(response) ? response.headers?.date ?? response.headers?.Date : void 0;
const awsAuthMiddlewareOptions = {
  name: "awsAuthMiddleware",
  tags: ["SIGNATURE", "AWSAUTH"],
  relation: "after",
  toMiddleware: "retryMiddleware",
  override: true
};
const getAwsAuthPlugin = (options) => ({
  applyToStack: (clientStack) => {
    clientStack.addRelativeTo(awsAuthMiddleware(options), awsAuthMiddlewareOptions);
  }
});
function resolveUserAgentConfig(input) {
  return {
    ...input,
    customUserAgent: typeof input.customUserAgent === "string" ? [[input.customUserAgent]] : input.customUserAgent
  };
}
const USER_AGENT = "user-agent";
const X_AMZ_USER_AGENT = "x-amz-user-agent";
const SPACE = " ";
const UA_ESCAPE_REGEX = /[^\!\#\$\%\&\'\*\+\-\.\^\_\`\|\~\d\w]/g;
const userAgentMiddleware = (options) => (next, context) => async (args) => {
  const { request: request2 } = args;
  if (!HttpRequest.isInstance(request2))
    return next(args);
  const { headers } = request2;
  const userAgent = context?.userAgent?.map(escapeUserAgent) || [];
  const defaultUserAgent2 = (await options.defaultUserAgentProvider()).map(escapeUserAgent);
  const customUserAgent = options?.customUserAgent?.map(escapeUserAgent) || [];
  const sdkUserAgentValue = [...defaultUserAgent2, ...userAgent, ...customUserAgent].join(SPACE);
  const normalUAValue = [
    ...defaultUserAgent2.filter((section) => section.startsWith("aws-sdk-")),
    ...customUserAgent
  ].join(SPACE);
  if (options.runtime !== "browser") {
    if (normalUAValue) {
      headers[X_AMZ_USER_AGENT] = headers[X_AMZ_USER_AGENT] ? `${headers[USER_AGENT]} ${normalUAValue}` : normalUAValue;
    }
    headers[USER_AGENT] = sdkUserAgentValue;
  } else {
    headers[X_AMZ_USER_AGENT] = sdkUserAgentValue;
  }
  return next({
    ...args,
    request: request2
  });
};
const escapeUserAgent = ([name2, version2]) => {
  const prefixSeparatorIndex = name2.indexOf("/");
  const prefix = name2.substring(0, prefixSeparatorIndex);
  let uaName = name2.substring(prefixSeparatorIndex + 1);
  if (prefix === "api") {
    uaName = uaName.toLowerCase();
  }
  return [prefix, uaName, version2].filter((item) => item && item.length > 0).map((item) => item?.replace(UA_ESCAPE_REGEX, "_")).join("/");
};
const getUserAgentMiddlewareOptions = {
  name: "getUserAgentMiddleware",
  step: "build",
  priority: "low",
  tags: ["SET_USER_AGENT", "USER_AGENT"],
  override: true
};
const getUserAgentPlugin = (config) => ({
  applyToStack: (clientStack) => {
    clientStack.add(userAgentMiddleware(config), getUserAgentMiddlewareOptions);
  }
});
const resolveClientEndpointParameters$3 = (options) => {
  return {
    ...options,
    useDualstackEndpoint: options.useDualstackEndpoint ?? false,
    useFipsEndpoint: options.useFipsEndpoint ?? false,
    defaultSigningName: "ssm"
  };
};
const name$3 = "@aws-sdk/client-ssm";
const description$3 = "AWS SDK for JavaScript Ssm Client for Node.js, Browser and React Native";
const version$4 = "3.279.0";
const scripts$3 = {
  build: "concurrently 'yarn:build:cjs' 'yarn:build:es' 'yarn:build:types'",
  "build:cjs": "tsc -p tsconfig.cjs.json",
  "build:docs": "typedoc",
  "build:es": "tsc -p tsconfig.es.json",
  "build:include:deps": "lerna run --scope $npm_package_name --include-dependencies build",
  "build:types": "tsc -p tsconfig.types.json",
  "build:types:downlevel": "downlevel-dts dist-types dist-types/ts3.4",
  clean: "rimraf ./dist-* && rimraf *.tsbuildinfo",
  "generate:client": "node ../../scripts/generate-clients/single-service --solo ssm"
};
const main$3 = "./dist-cjs/index.js";
const types$3 = "./dist-types/index.d.ts";
const module$4 = "./dist-es/index.js";
const sideEffects$3 = false;
const dependencies$3 = {
  "@aws-crypto/sha256-browser": "3.0.0",
  "@aws-crypto/sha256-js": "3.0.0",
  "@aws-sdk/client-sts": "3.279.0",
  "@aws-sdk/config-resolver": "3.272.0",
  "@aws-sdk/credential-provider-node": "3.279.0",
  "@aws-sdk/fetch-http-handler": "3.272.0",
  "@aws-sdk/hash-node": "3.272.0",
  "@aws-sdk/invalid-dependency": "3.272.0",
  "@aws-sdk/middleware-content-length": "3.272.0",
  "@aws-sdk/middleware-endpoint": "3.272.0",
  "@aws-sdk/middleware-host-header": "3.278.0",
  "@aws-sdk/middleware-logger": "3.272.0",
  "@aws-sdk/middleware-recursion-detection": "3.272.0",
  "@aws-sdk/middleware-retry": "3.272.0",
  "@aws-sdk/middleware-serde": "3.272.0",
  "@aws-sdk/middleware-signing": "3.272.0",
  "@aws-sdk/middleware-stack": "3.272.0",
  "@aws-sdk/middleware-user-agent": "3.272.0",
  "@aws-sdk/node-config-provider": "3.272.0",
  "@aws-sdk/node-http-handler": "3.272.0",
  "@aws-sdk/protocol-http": "3.272.0",
  "@aws-sdk/smithy-client": "3.279.0",
  "@aws-sdk/types": "3.272.0",
  "@aws-sdk/url-parser": "3.272.0",
  "@aws-sdk/util-base64": "3.208.0",
  "@aws-sdk/util-body-length-browser": "3.188.0",
  "@aws-sdk/util-body-length-node": "3.208.0",
  "@aws-sdk/util-defaults-mode-browser": "3.279.0",
  "@aws-sdk/util-defaults-mode-node": "3.279.0",
  "@aws-sdk/util-endpoints": "3.272.0",
  "@aws-sdk/util-retry": "3.272.0",
  "@aws-sdk/util-user-agent-browser": "3.272.0",
  "@aws-sdk/util-user-agent-node": "3.272.0",
  "@aws-sdk/util-utf8": "3.254.0",
  "@aws-sdk/util-waiter": "3.272.0",
  tslib: "^2.3.1",
  uuid: "^8.3.2"
};
const devDependencies$3 = {
  "@aws-sdk/service-client-documentation-generator": "3.208.0",
  "@tsconfig/node14": "1.0.3",
  "@types/node": "^14.14.31",
  "@types/uuid": "^8.3.0",
  concurrently: "7.0.0",
  "downlevel-dts": "0.10.1",
  rimraf: "3.0.2",
  typedoc: "0.19.2",
  typescript: "~4.6.2"
};
const overrides$3 = {
  typedoc: {
    typescript: "~4.6.2"
  }
};
const engines$3 = {
  node: ">=14.0.0"
};
const typesVersions$3 = {
  "<4.0": {
    "dist-types/*": [
      "dist-types/ts3.4/*"
    ]
  }
};
const files$3 = [
  "dist-*"
];
const author$3 = {
  name: "AWS SDK for JavaScript Team",
  url: "https://aws.amazon.com/javascript/"
};
const license$3 = "Apache-2.0";
const browser$3 = {
  "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.browser"
};
const homepage$3 = "https://github.com/aws/aws-sdk-js-v3/tree/main/clients/client-ssm";
const repository$3 = {
  type: "git",
  url: "https://github.com/aws/aws-sdk-js-v3.git",
  directory: "clients/client-ssm"
};
const packageInfo$3 = {
  name: name$3,
  description: description$3,
  version: version$4,
  scripts: scripts$3,
  main: main$3,
  types: types$3,
  module: module$4,
  sideEffects: sideEffects$3,
  dependencies: dependencies$3,
  devDependencies: devDependencies$3,
  overrides: overrides$3,
  engines: engines$3,
  typesVersions: typesVersions$3,
  files: files$3,
  author: author$3,
  license: license$3,
  browser: browser$3,
  "react-native": {
    "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.native"
  },
  homepage: homepage$3,
  repository: repository$3
};
class STSServiceException extends ServiceException {
  constructor(options) {
    super(options);
    Object.setPrototypeOf(this, STSServiceException.prototype);
  }
}
let ExpiredTokenException$1 = class ExpiredTokenException extends STSServiceException {
  constructor(opts) {
    super({
      name: "ExpiredTokenException",
      $fault: "client",
      ...opts
    });
    this.name = "ExpiredTokenException";
    this.$fault = "client";
    Object.setPrototypeOf(this, ExpiredTokenException.prototype);
  }
};
class MalformedPolicyDocumentException extends STSServiceException {
  constructor(opts) {
    super({
      name: "MalformedPolicyDocumentException",
      $fault: "client",
      ...opts
    });
    this.name = "MalformedPolicyDocumentException";
    this.$fault = "client";
    Object.setPrototypeOf(this, MalformedPolicyDocumentException.prototype);
  }
}
class PackedPolicyTooLargeException extends STSServiceException {
  constructor(opts) {
    super({
      name: "PackedPolicyTooLargeException",
      $fault: "client",
      ...opts
    });
    this.name = "PackedPolicyTooLargeException";
    this.$fault = "client";
    Object.setPrototypeOf(this, PackedPolicyTooLargeException.prototype);
  }
}
class RegionDisabledException extends STSServiceException {
  constructor(opts) {
    super({
      name: "RegionDisabledException",
      $fault: "client",
      ...opts
    });
    this.name = "RegionDisabledException";
    this.$fault = "client";
    Object.setPrototypeOf(this, RegionDisabledException.prototype);
  }
}
class IDPRejectedClaimException extends STSServiceException {
  constructor(opts) {
    super({
      name: "IDPRejectedClaimException",
      $fault: "client",
      ...opts
    });
    this.name = "IDPRejectedClaimException";
    this.$fault = "client";
    Object.setPrototypeOf(this, IDPRejectedClaimException.prototype);
  }
}
class InvalidIdentityTokenException extends STSServiceException {
  constructor(opts) {
    super({
      name: "InvalidIdentityTokenException",
      $fault: "client",
      ...opts
    });
    this.name = "InvalidIdentityTokenException";
    this.$fault = "client";
    Object.setPrototypeOf(this, InvalidIdentityTokenException.prototype);
  }
}
class IDPCommunicationErrorException extends STSServiceException {
  constructor(opts) {
    super({
      name: "IDPCommunicationErrorException",
      $fault: "client",
      ...opts
    });
    this.name = "IDPCommunicationErrorException";
    this.$fault = "client";
    Object.setPrototypeOf(this, IDPCommunicationErrorException.prototype);
  }
}
const AssumeRoleRequestFilterSensitiveLog = (obj) => ({
  ...obj
});
const AssumeRoleResponseFilterSensitiveLog = (obj) => ({
  ...obj
});
const AssumeRoleWithWebIdentityRequestFilterSensitiveLog = (obj) => ({
  ...obj
});
const AssumeRoleWithWebIdentityResponseFilterSensitiveLog = (obj) => ({
  ...obj
});
var validator$2 = {};
var util$2 = {};
(function(exports) {
  const nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
  const nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
  const nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
  const regexName = new RegExp("^" + nameRegexp + "$");
  const getAllMatches = function(string, regex) {
    const matches = [];
    let match = regex.exec(string);
    while (match) {
      const allmatches = [];
      allmatches.startIndex = regex.lastIndex - match[0].length;
      const len = match.length;
      for (let index2 = 0; index2 < len; index2++) {
        allmatches.push(match[index2]);
      }
      matches.push(allmatches);
      match = regex.exec(string);
    }
    return matches;
  };
  const isName = function(string) {
    const match = regexName.exec(string);
    return !(match === null || typeof match === "undefined");
  };
  exports.isExist = function(v2) {
    return typeof v2 !== "undefined";
  };
  exports.isEmptyObject = function(obj) {
    return Object.keys(obj).length === 0;
  };
  exports.merge = function(target, a2, arrayMode) {
    if (a2) {
      const keys = Object.keys(a2);
      const len = keys.length;
      for (let i2 = 0; i2 < len; i2++) {
        if (arrayMode === "strict") {
          target[keys[i2]] = [a2[keys[i2]]];
        } else {
          target[keys[i2]] = a2[keys[i2]];
        }
      }
    }
  };
  exports.getValue = function(v2) {
    if (exports.isExist(v2)) {
      return v2;
    } else {
      return "";
    }
  };
  exports.isName = isName;
  exports.getAllMatches = getAllMatches;
  exports.nameRegexp = nameRegexp;
})(util$2);
const util$1 = util$2;
const defaultOptions$2 = {
  allowBooleanAttributes: false,
  //A tag can have attributes without any value
  unpairedTags: []
};
validator$2.validate = function(xmlData, options) {
  options = Object.assign({}, defaultOptions$2, options);
  const tags = [];
  let tagFound = false;
  let reachedRoot = false;
  if (xmlData[0] === "\uFEFF") {
    xmlData = xmlData.substr(1);
  }
  for (let i2 = 0; i2 < xmlData.length; i2++) {
    if (xmlData[i2] === "<" && xmlData[i2 + 1] === "?") {
      i2 += 2;
      i2 = readPI(xmlData, i2);
      if (i2.err)
        return i2;
    } else if (xmlData[i2] === "<") {
      let tagStartPos = i2;
      i2++;
      if (xmlData[i2] === "!") {
        i2 = readCommentAndCDATA(xmlData, i2);
        continue;
      } else {
        let closingTag = false;
        if (xmlData[i2] === "/") {
          closingTag = true;
          i2++;
        }
        let tagName = "";
        for (; i2 < xmlData.length && xmlData[i2] !== ">" && xmlData[i2] !== " " && xmlData[i2] !== "	" && xmlData[i2] !== "\n" && xmlData[i2] !== "\r"; i2++) {
          tagName += xmlData[i2];
        }
        tagName = tagName.trim();
        if (tagName[tagName.length - 1] === "/") {
          tagName = tagName.substring(0, tagName.length - 1);
          i2--;
        }
        if (!validateTagName(tagName)) {
          let msg;
          if (tagName.trim().length === 0) {
            msg = "Invalid space after '<'.";
          } else {
            msg = "Tag '" + tagName + "' is an invalid name.";
          }
          return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i2));
        }
        const result = readAttributeStr(xmlData, i2);
        if (result === false) {
          return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i2));
        }
        let attrStr = result.value;
        i2 = result.index;
        if (attrStr[attrStr.length - 1] === "/") {
          const attrStrStart = i2 - attrStr.length;
          attrStr = attrStr.substring(0, attrStr.length - 1);
          const isValid = validateAttributeString(attrStr, options);
          if (isValid === true) {
            tagFound = true;
          } else {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
          }
        } else if (closingTag) {
          if (!result.tagClosed) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i2));
          } else if (attrStr.trim().length > 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
          } else {
            const otg = tags.pop();
            if (tagName !== otg.tagName) {
              let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
              return getErrorObject(
                "InvalidTag",
                "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.",
                getLineNumberForPosition(xmlData, tagStartPos)
              );
            }
            if (tags.length == 0) {
              reachedRoot = true;
            }
          }
        } else {
          const isValid = validateAttributeString(attrStr, options);
          if (isValid !== true) {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i2 - attrStr.length + isValid.err.line));
          }
          if (reachedRoot === true) {
            return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i2));
          } else if (options.unpairedTags.indexOf(tagName) !== -1)
            ;
          else {
            tags.push({ tagName, tagStartPos });
          }
          tagFound = true;
        }
        for (i2++; i2 < xmlData.length; i2++) {
          if (xmlData[i2] === "<") {
            if (xmlData[i2 + 1] === "!") {
              i2++;
              i2 = readCommentAndCDATA(xmlData, i2);
              continue;
            } else if (xmlData[i2 + 1] === "?") {
              i2 = readPI(xmlData, ++i2);
              if (i2.err)
                return i2;
            } else {
              break;
            }
          } else if (xmlData[i2] === "&") {
            const afterAmp = validateAmpersand(xmlData, i2);
            if (afterAmp == -1)
              return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i2));
            i2 = afterAmp;
          } else {
            if (reachedRoot === true && !isWhiteSpace(xmlData[i2])) {
              return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i2));
            }
          }
        }
        if (xmlData[i2] === "<") {
          i2--;
        }
      }
    } else {
      if (isWhiteSpace(xmlData[i2])) {
        continue;
      }
      return getErrorObject("InvalidChar", "char '" + xmlData[i2] + "' is not expected.", getLineNumberForPosition(xmlData, i2));
    }
  }
  if (!tagFound) {
    return getErrorObject("InvalidXml", "Start tag expected.", 1);
  } else if (tags.length == 1) {
    return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
  } else if (tags.length > 0) {
    return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t2) => t2.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
  }
  return true;
};
function isWhiteSpace(char) {
  return char === " " || char === "	" || char === "\n" || char === "\r";
}
function readPI(xmlData, i2) {
  const start = i2;
  for (; i2 < xmlData.length; i2++) {
    if (xmlData[i2] == "?" || xmlData[i2] == " ") {
      const tagname = xmlData.substr(start, i2 - start);
      if (i2 > 5 && tagname === "xml") {
        return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i2));
      } else if (xmlData[i2] == "?" && xmlData[i2 + 1] == ">") {
        i2++;
        break;
      } else {
        continue;
      }
    }
  }
  return i2;
}
function readCommentAndCDATA(xmlData, i2) {
  if (xmlData.length > i2 + 5 && xmlData[i2 + 1] === "-" && xmlData[i2 + 2] === "-") {
    for (i2 += 3; i2 < xmlData.length; i2++) {
      if (xmlData[i2] === "-" && xmlData[i2 + 1] === "-" && xmlData[i2 + 2] === ">") {
        i2 += 2;
        break;
      }
    }
  } else if (xmlData.length > i2 + 8 && xmlData[i2 + 1] === "D" && xmlData[i2 + 2] === "O" && xmlData[i2 + 3] === "C" && xmlData[i2 + 4] === "T" && xmlData[i2 + 5] === "Y" && xmlData[i2 + 6] === "P" && xmlData[i2 + 7] === "E") {
    let angleBracketsCount = 1;
    for (i2 += 8; i2 < xmlData.length; i2++) {
      if (xmlData[i2] === "<") {
        angleBracketsCount++;
      } else if (xmlData[i2] === ">") {
        angleBracketsCount--;
        if (angleBracketsCount === 0) {
          break;
        }
      }
    }
  } else if (xmlData.length > i2 + 9 && xmlData[i2 + 1] === "[" && xmlData[i2 + 2] === "C" && xmlData[i2 + 3] === "D" && xmlData[i2 + 4] === "A" && xmlData[i2 + 5] === "T" && xmlData[i2 + 6] === "A" && xmlData[i2 + 7] === "[") {
    for (i2 += 8; i2 < xmlData.length; i2++) {
      if (xmlData[i2] === "]" && xmlData[i2 + 1] === "]" && xmlData[i2 + 2] === ">") {
        i2 += 2;
        break;
      }
    }
  }
  return i2;
}
const doubleQuote = '"';
const singleQuote = "'";
function readAttributeStr(xmlData, i2) {
  let attrStr = "";
  let startChar = "";
  let tagClosed = false;
  for (; i2 < xmlData.length; i2++) {
    if (xmlData[i2] === doubleQuote || xmlData[i2] === singleQuote) {
      if (startChar === "") {
        startChar = xmlData[i2];
      } else if (startChar !== xmlData[i2])
        ;
      else {
        startChar = "";
      }
    } else if (xmlData[i2] === ">") {
      if (startChar === "") {
        tagClosed = true;
        break;
      }
    }
    attrStr += xmlData[i2];
  }
  if (startChar !== "") {
    return false;
  }
  return {
    value: attrStr,
    index: i2,
    tagClosed
  };
}
const validAttrStrRegxp = new RegExp(`(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['"])(([\\s\\S])*?)\\5)?`, "g");
function validateAttributeString(attrStr, options) {
  const matches = util$1.getAllMatches(attrStr, validAttrStrRegxp);
  const attrNames = {};
  for (let i2 = 0; i2 < matches.length; i2++) {
    if (matches[i2][1].length === 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i2][2] + "' has no space in starting.", getPositionFromMatch(matches[i2]));
    } else if (matches[i2][3] !== void 0 && matches[i2][4] === void 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i2][2] + "' is without value.", getPositionFromMatch(matches[i2]));
    } else if (matches[i2][3] === void 0 && !options.allowBooleanAttributes) {
      return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i2][2] + "' is not allowed.", getPositionFromMatch(matches[i2]));
    }
    const attrName = matches[i2][2];
    if (!validateAttrName(attrName)) {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i2]));
    }
    if (!attrNames.hasOwnProperty(attrName)) {
      attrNames[attrName] = 1;
    } else {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i2]));
    }
  }
  return true;
}
function validateNumberAmpersand(xmlData, i2) {
  let re = /\d/;
  if (xmlData[i2] === "x") {
    i2++;
    re = /[\da-fA-F]/;
  }
  for (; i2 < xmlData.length; i2++) {
    if (xmlData[i2] === ";")
      return i2;
    if (!xmlData[i2].match(re))
      break;
  }
  return -1;
}
function validateAmpersand(xmlData, i2) {
  i2++;
  if (xmlData[i2] === ";")
    return -1;
  if (xmlData[i2] === "#") {
    i2++;
    return validateNumberAmpersand(xmlData, i2);
  }
  let count = 0;
  for (; i2 < xmlData.length; i2++, count++) {
    if (xmlData[i2].match(/\w/) && count < 20)
      continue;
    if (xmlData[i2] === ";")
      break;
    return -1;
  }
  return i2;
}
function getErrorObject(code, message, lineNumber) {
  return {
    err: {
      code,
      msg: message,
      line: lineNumber.line || lineNumber,
      col: lineNumber.col
    }
  };
}
function validateAttrName(attrName) {
  return util$1.isName(attrName);
}
function validateTagName(tagname) {
  return util$1.isName(tagname);
}
function getLineNumberForPosition(xmlData, index2) {
  const lines = xmlData.substring(0, index2).split(/\r?\n/);
  return {
    line: lines.length,
    // column number is last line's length + 1, because column numbering starts at 1:
    col: lines[lines.length - 1].length + 1
  };
}
function getPositionFromMatch(match) {
  return match.startIndex + match[1].length;
}
var OptionsBuilder = {};
const defaultOptions$1 = {
  preserveOrder: false,
  attributeNamePrefix: "@_",
  attributesGroupName: false,
  textNodeName: "#text",
  ignoreAttributes: true,
  removeNSPrefix: false,
  // remove NS from tag name or attribute name if true
  allowBooleanAttributes: false,
  //a tag can have attributes without any value
  //ignoreRootElement : false,
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true,
  //Trim string values of tag and attributes
  cdataPropName: false,
  numberParseOptions: {
    hex: true,
    leadingZeros: true,
    eNotation: true
  },
  tagValueProcessor: function(tagName, val) {
    return val;
  },
  attributeValueProcessor: function(attrName, val) {
    return val;
  },
  stopNodes: [],
  //nested tags will not be parsed even for errors
  alwaysCreateTextNode: false,
  isArray: () => false,
  commentPropName: false,
  unpairedTags: [],
  processEntities: true,
  htmlEntities: false,
  ignoreDeclaration: false,
  ignorePiTags: false,
  transformTagName: false,
  transformAttributeName: false
};
const buildOptions$1 = function(options) {
  return Object.assign({}, defaultOptions$1, options);
};
OptionsBuilder.buildOptions = buildOptions$1;
OptionsBuilder.defaultOptions = defaultOptions$1;
class XmlNode {
  constructor(tagname) {
    this.tagname = tagname;
    this.child = [];
    this[":@"] = {};
  }
  add(key, val) {
    if (key === "__proto__")
      key = "#__proto__";
    this.child.push({ [key]: val });
  }
  addChild(node) {
    if (node.tagname === "__proto__")
      node.tagname = "#__proto__";
    if (node[":@"] && Object.keys(node[":@"]).length > 0) {
      this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
    } else {
      this.child.push({ [node.tagname]: node.child });
    }
  }
}
var xmlNode$1 = XmlNode;
function readDocType$1(xmlData, i2) {
  const entities = {};
  if (xmlData[i2 + 3] === "O" && xmlData[i2 + 4] === "C" && xmlData[i2 + 5] === "T" && xmlData[i2 + 6] === "Y" && xmlData[i2 + 7] === "P" && xmlData[i2 + 8] === "E") {
    i2 = i2 + 9;
    let angleBracketsCount = 1;
    let hasBody = false, entity = false, comment = false;
    let exp = "";
    for (; i2 < xmlData.length; i2++) {
      if (xmlData[i2] === "<" && !comment) {
        if (hasBody && xmlData[i2 + 1] === "!" && xmlData[i2 + 2] === "E" && xmlData[i2 + 3] === "N" && xmlData[i2 + 4] === "T" && xmlData[i2 + 5] === "I" && xmlData[i2 + 6] === "T" && xmlData[i2 + 7] === "Y") {
          i2 += 7;
          entity = true;
        } else if (hasBody && xmlData[i2 + 1] === "!" && xmlData[i2 + 2] === "E" && xmlData[i2 + 3] === "L" && xmlData[i2 + 4] === "E" && xmlData[i2 + 5] === "M" && xmlData[i2 + 6] === "E" && xmlData[i2 + 7] === "N" && xmlData[i2 + 8] === "T") {
          i2 += 8;
        } else if (hasBody && xmlData[i2 + 1] === "!" && xmlData[i2 + 2] === "A" && xmlData[i2 + 3] === "T" && xmlData[i2 + 4] === "T" && xmlData[i2 + 5] === "L" && xmlData[i2 + 6] === "I" && xmlData[i2 + 7] === "S" && xmlData[i2 + 8] === "T") {
          i2 += 8;
        } else if (hasBody && xmlData[i2 + 1] === "!" && xmlData[i2 + 2] === "N" && xmlData[i2 + 3] === "O" && xmlData[i2 + 4] === "T" && xmlData[i2 + 5] === "A" && xmlData[i2 + 6] === "T" && xmlData[i2 + 7] === "I" && xmlData[i2 + 8] === "O" && xmlData[i2 + 9] === "N") {
          i2 += 9;
        } else if (
          //comment
          xmlData[i2 + 1] === "!" && xmlData[i2 + 2] === "-" && xmlData[i2 + 3] === "-"
        ) {
          comment = true;
        } else {
          throw new Error("Invalid DOCTYPE");
        }
        angleBracketsCount++;
        exp = "";
      } else if (xmlData[i2] === ">") {
        if (comment) {
          if (xmlData[i2 - 1] === "-" && xmlData[i2 - 2] === "-") {
            comment = false;
            angleBracketsCount--;
          }
        } else {
          if (entity) {
            parseEntityExp(exp, entities);
            entity = false;
          }
          angleBracketsCount--;
        }
        if (angleBracketsCount === 0) {
          break;
        }
      } else if (xmlData[i2] === "[") {
        hasBody = true;
      } else {
        exp += xmlData[i2];
      }
    }
    if (angleBracketsCount !== 0) {
      throw new Error(`Unclosed DOCTYPE`);
    }
  } else {
    throw new Error(`Invalid Tag instead of DOCTYPE`);
  }
  return { entities, i: i2 };
}
const entityRegex = RegExp(`^\\s([a-zA-z0-0]+)[ 	](['"])([^&]+)\\2`);
function parseEntityExp(exp, entities) {
  const match = entityRegex.exec(exp);
  if (match) {
    entities[match[1]] = {
      regx: RegExp(`&${match[1]};`, "g"),
      val: match[3]
    };
  }
}
var DocTypeReader = readDocType$1;
const hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
const numRegex = /^([\-\+])?(0*)(\.[0-9]+([eE]\-?[0-9]+)?|[0-9]+(\.[0-9]+([eE]\-?[0-9]+)?)?)$/;
if (!Number.parseInt && window.parseInt) {
  Number.parseInt = window.parseInt;
}
if (!Number.parseFloat && window.parseFloat) {
  Number.parseFloat = window.parseFloat;
}
const consider = {
  hex: true,
  leadingZeros: true,
  decimalPoint: ".",
  eNotation: true
  //skipLike: /regex/
};
function toNumber$1(str, options = {}) {
  options = Object.assign({}, consider, options);
  if (!str || typeof str !== "string")
    return str;
  let trimmedStr = str.trim();
  if (options.skipLike !== void 0 && options.skipLike.test(trimmedStr))
    return str;
  else if (options.hex && hexRegex.test(trimmedStr)) {
    return Number.parseInt(trimmedStr, 16);
  } else {
    const match = numRegex.exec(trimmedStr);
    if (match) {
      const sign = match[1];
      const leadingZeros = match[2];
      let numTrimmedByZeros = trimZeros(match[3]);
      const eNotation = match[4] || match[6];
      if (!options.leadingZeros && leadingZeros.length > 0 && sign && trimmedStr[2] !== ".")
        return str;
      else if (!options.leadingZeros && leadingZeros.length > 0 && !sign && trimmedStr[1] !== ".")
        return str;
      else {
        const num = Number(trimmedStr);
        const numStr = "" + num;
        if (numStr.search(/[eE]/) !== -1) {
          if (options.eNotation)
            return num;
          else
            return str;
        } else if (eNotation) {
          if (options.eNotation)
            return num;
          else
            return str;
        } else if (trimmedStr.indexOf(".") !== -1) {
          if (numStr === "0" && numTrimmedByZeros === "")
            return num;
          else if (numStr === numTrimmedByZeros)
            return num;
          else if (sign && numStr === "-" + numTrimmedByZeros)
            return num;
          else
            return str;
        }
        if (leadingZeros) {
          if (numTrimmedByZeros === numStr)
            return num;
          else if (sign + numTrimmedByZeros === numStr)
            return num;
          else
            return str;
        }
        if (trimmedStr === numStr)
          return num;
        else if (trimmedStr === sign + numStr)
          return num;
        return str;
      }
    } else {
      return str;
    }
  }
}
function trimZeros(numStr) {
  if (numStr && numStr.indexOf(".") !== -1) {
    numStr = numStr.replace(/0+$/, "");
    if (numStr === ".")
      numStr = "0";
    else if (numStr[0] === ".")
      numStr = "0" + numStr;
    else if (numStr[numStr.length - 1] === ".")
      numStr = numStr.substr(0, numStr.length - 1);
    return numStr;
  }
  return numStr;
}
var strnum = toNumber$1;
const util = util$2;
const xmlNode = xmlNode$1;
const readDocType = DocTypeReader;
const toNumber = strnum;
"<((!\\[CDATA\\[([\\s\\S]*?)(]]>))|((NAME:)?(NAME))([^>]*)>|((\\/)(NAME)\\s*>))([^<]*)".replace(/NAME/g, util.nameRegexp);
let OrderedObjParser$1 = class OrderedObjParser {
  constructor(options) {
    this.options = options;
    this.currentNode = null;
    this.tagsNodeStack = [];
    this.docTypeEntities = {};
    this.lastEntities = {
      "apos": { regex: /&(apos|#39|#x27);/g, val: "'" },
      "gt": { regex: /&(gt|#62|#x3E);/g, val: ">" },
      "lt": { regex: /&(lt|#60|#x3C);/g, val: "<" },
      "quot": { regex: /&(quot|#34|#x22);/g, val: '"' }
    };
    this.ampEntity = { regex: /&(amp|#38|#x26);/g, val: "&" };
    this.htmlEntities = {
      "space": { regex: /&(nbsp|#160);/g, val: " " },
      // "lt" : { regex: /&(lt|#60);/g, val: "<" },
      // "gt" : { regex: /&(gt|#62);/g, val: ">" },
      // "amp" : { regex: /&(amp|#38);/g, val: "&" },
      // "quot" : { regex: /&(quot|#34);/g, val: "\"" },
      // "apos" : { regex: /&(apos|#39);/g, val: "'" },
      "cent": { regex: /&(cent|#162);/g, val: "¢" },
      "pound": { regex: /&(pound|#163);/g, val: "£" },
      "yen": { regex: /&(yen|#165);/g, val: "¥" },
      "euro": { regex: /&(euro|#8364);/g, val: "€" },
      "copyright": { regex: /&(copy|#169);/g, val: "©" },
      "reg": { regex: /&(reg|#174);/g, val: "®" },
      "inr": { regex: /&(inr|#8377);/g, val: "₹" }
    };
    this.addExternalEntities = addExternalEntities;
    this.parseXml = parseXml;
    this.parseTextData = parseTextData;
    this.resolveNameSpace = resolveNameSpace;
    this.buildAttributesMap = buildAttributesMap;
    this.isItStopNode = isItStopNode;
    this.replaceEntitiesValue = replaceEntitiesValue$1;
    this.readStopNodeData = readStopNodeData;
    this.saveTextToParentTag = saveTextToParentTag;
  }
};
function addExternalEntities(externalEntities) {
  const entKeys = Object.keys(externalEntities);
  for (let i2 = 0; i2 < entKeys.length; i2++) {
    const ent = entKeys[i2];
    this.lastEntities[ent] = {
      regex: new RegExp("&" + ent + ";", "g"),
      val: externalEntities[ent]
    };
  }
}
function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
  if (val !== void 0) {
    if (this.options.trimValues && !dontTrim) {
      val = val.trim();
    }
    if (val.length > 0) {
      if (!escapeEntities)
        val = this.replaceEntitiesValue(val);
      const newval = this.options.tagValueProcessor(tagName, val, jPath, hasAttributes, isLeafNode);
      if (newval === null || newval === void 0) {
        return val;
      } else if (typeof newval !== typeof val || newval !== val) {
        return newval;
      } else if (this.options.trimValues) {
        return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
      } else {
        const trimmedVal = val.trim();
        if (trimmedVal === val) {
          return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
        } else {
          return val;
        }
      }
    }
  }
}
function resolveNameSpace(tagname) {
  if (this.options.removeNSPrefix) {
    const tags = tagname.split(":");
    const prefix = tagname.charAt(0) === "/" ? "/" : "";
    if (tags[0] === "xmlns") {
      return "";
    }
    if (tags.length === 2) {
      tagname = prefix + tags[1];
    }
  }
  return tagname;
}
const attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
function buildAttributesMap(attrStr, jPath) {
  if (!this.options.ignoreAttributes && typeof attrStr === "string") {
    const matches = util.getAllMatches(attrStr, attrsRegx);
    const len = matches.length;
    const attrs = {};
    for (let i2 = 0; i2 < len; i2++) {
      const attrName = this.resolveNameSpace(matches[i2][1]);
      let oldVal = matches[i2][4];
      let aName = this.options.attributeNamePrefix + attrName;
      if (attrName.length) {
        if (this.options.transformAttributeName) {
          aName = this.options.transformAttributeName(aName);
        }
        if (aName === "__proto__")
          aName = "#__proto__";
        if (oldVal !== void 0) {
          if (this.options.trimValues) {
            oldVal = oldVal.trim();
          }
          oldVal = this.replaceEntitiesValue(oldVal);
          const newVal = this.options.attributeValueProcessor(attrName, oldVal, jPath);
          if (newVal === null || newVal === void 0) {
            attrs[aName] = oldVal;
          } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
            attrs[aName] = newVal;
          } else {
            attrs[aName] = parseValue(
              oldVal,
              this.options.parseAttributeValue,
              this.options.numberParseOptions
            );
          }
        } else if (this.options.allowBooleanAttributes) {
          attrs[aName] = true;
        }
      }
    }
    if (!Object.keys(attrs).length) {
      return;
    }
    if (this.options.attributesGroupName) {
      const attrCollection = {};
      attrCollection[this.options.attributesGroupName] = attrs;
      return attrCollection;
    }
    return attrs;
  }
}
const parseXml = function(xmlData) {
  xmlData = xmlData.replace(/\r\n?/g, "\n");
  const xmlObj = new xmlNode("!xml");
  let currentNode = xmlObj;
  let textData = "";
  let jPath = "";
  for (let i2 = 0; i2 < xmlData.length; i2++) {
    const ch = xmlData[i2];
    if (ch === "<") {
      if (xmlData[i2 + 1] === "/") {
        const closeIndex = findClosingIndex(xmlData, ">", i2, "Closing Tag is not closed.");
        let tagName = xmlData.substring(i2 + 2, closeIndex).trim();
        if (this.options.removeNSPrefix) {
          const colonIndex = tagName.indexOf(":");
          if (colonIndex !== -1) {
            tagName = tagName.substr(colonIndex + 1);
          }
        }
        if (this.options.transformTagName) {
          tagName = this.options.transformTagName(tagName);
        }
        if (currentNode) {
          textData = this.saveTextToParentTag(textData, currentNode, jPath);
        }
        jPath = jPath.substr(0, jPath.lastIndexOf("."));
        currentNode = this.tagsNodeStack.pop();
        textData = "";
        i2 = closeIndex;
      } else if (xmlData[i2 + 1] === "?") {
        let tagData = readTagExp(xmlData, i2, false, "?>");
        if (!tagData)
          throw new Error("Pi Tag is not closed.");
        textData = this.saveTextToParentTag(textData, currentNode, jPath);
        if (this.options.ignoreDeclaration && tagData.tagName === "?xml" || this.options.ignorePiTags)
          ;
        else {
          const childNode = new xmlNode(tagData.tagName);
          childNode.add(this.options.textNodeName, "");
          if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent) {
            childNode[":@"] = this.buildAttributesMap(tagData.tagExp, jPath);
          }
          currentNode.addChild(childNode);
        }
        i2 = tagData.closeIndex + 1;
      } else if (xmlData.substr(i2 + 1, 3) === "!--") {
        const endIndex = findClosingIndex(xmlData, "-->", i2 + 4, "Comment is not closed.");
        if (this.options.commentPropName) {
          const comment = xmlData.substring(i2 + 4, endIndex - 2);
          textData = this.saveTextToParentTag(textData, currentNode, jPath);
          currentNode.add(this.options.commentPropName, [{ [this.options.textNodeName]: comment }]);
        }
        i2 = endIndex;
      } else if (xmlData.substr(i2 + 1, 2) === "!D") {
        const result = readDocType(xmlData, i2);
        this.docTypeEntities = result.entities;
        i2 = result.i;
      } else if (xmlData.substr(i2 + 1, 2) === "![") {
        const closeIndex = findClosingIndex(xmlData, "]]>", i2, "CDATA is not closed.") - 2;
        const tagExp = xmlData.substring(i2 + 9, closeIndex);
        textData = this.saveTextToParentTag(textData, currentNode, jPath);
        if (this.options.cdataPropName) {
          currentNode.add(this.options.cdataPropName, [{ [this.options.textNodeName]: tagExp }]);
        } else {
          let val = this.parseTextData(tagExp, currentNode.tagname, jPath, true, false, true);
          if (val == void 0)
            val = "";
          currentNode.add(this.options.textNodeName, val);
        }
        i2 = closeIndex + 2;
      } else {
        let result = readTagExp(xmlData, i2, this.options.removeNSPrefix);
        let tagName = result.tagName;
        let tagExp = result.tagExp;
        let attrExpPresent = result.attrExpPresent;
        let closeIndex = result.closeIndex;
        if (this.options.transformTagName) {
          tagName = this.options.transformTagName(tagName);
        }
        if (currentNode && textData) {
          if (currentNode.tagname !== "!xml") {
            textData = this.saveTextToParentTag(textData, currentNode, jPath, false);
          }
        }
        if (tagName !== xmlObj.tagname) {
          jPath += jPath ? "." + tagName : tagName;
        }
        const lastTag = currentNode;
        if (lastTag && this.options.unpairedTags.indexOf(lastTag.tagname) !== -1) {
          currentNode = this.tagsNodeStack.pop();
        }
        if (this.isItStopNode(this.options.stopNodes, jPath, tagName)) {
          let tagContent = "";
          if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
            i2 = result.closeIndex;
          } else if (this.options.unpairedTags.indexOf(tagName) !== -1) {
            i2 = result.closeIndex;
          } else {
            const result2 = this.readStopNodeData(xmlData, tagName, closeIndex + 1);
            if (!result2)
              throw new Error(`Unexpected end of ${tagName}`);
            i2 = result2.i;
            tagContent = result2.tagContent;
          }
          const childNode = new xmlNode(tagName);
          if (tagName !== tagExp && attrExpPresent) {
            childNode[":@"] = this.buildAttributesMap(tagExp, jPath);
          }
          if (tagContent) {
            tagContent = this.parseTextData(tagContent, tagName, jPath, true, attrExpPresent, true, true);
          }
          jPath = jPath.substr(0, jPath.lastIndexOf("."));
          childNode.add(this.options.textNodeName, tagContent);
          currentNode.addChild(childNode);
        } else {
          if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
            if (tagName[tagName.length - 1] === "/") {
              tagName = tagName.substr(0, tagName.length - 1);
              tagExp = tagName;
            } else {
              tagExp = tagExp.substr(0, tagExp.length - 1);
            }
            if (this.options.transformTagName) {
              tagName = this.options.transformTagName(tagName);
            }
            const childNode = new xmlNode(tagName);
            if (tagName !== tagExp && attrExpPresent) {
              childNode[":@"] = this.buildAttributesMap(tagExp, jPath);
            }
            jPath = jPath.substr(0, jPath.lastIndexOf("."));
            currentNode.addChild(childNode);
          } else {
            const childNode = new xmlNode(tagName);
            this.tagsNodeStack.push(currentNode);
            if (tagName !== tagExp && attrExpPresent) {
              childNode[":@"] = this.buildAttributesMap(tagExp, jPath);
            }
            currentNode.addChild(childNode);
            currentNode = childNode;
          }
          textData = "";
          i2 = closeIndex;
        }
      }
    } else {
      textData += xmlData[i2];
    }
  }
  return xmlObj.child;
};
const replaceEntitiesValue$1 = function(val) {
  if (this.options.processEntities) {
    for (let entityName in this.docTypeEntities) {
      const entity = this.docTypeEntities[entityName];
      val = val.replace(entity.regx, entity.val);
    }
    for (let entityName in this.lastEntities) {
      const entity = this.lastEntities[entityName];
      val = val.replace(entity.regex, entity.val);
    }
    if (this.options.htmlEntities) {
      for (let entityName in this.htmlEntities) {
        const entity = this.htmlEntities[entityName];
        val = val.replace(entity.regex, entity.val);
      }
    }
    val = val.replace(this.ampEntity.regex, this.ampEntity.val);
  }
  return val;
};
function saveTextToParentTag(textData, currentNode, jPath, isLeafNode) {
  if (textData) {
    if (isLeafNode === void 0)
      isLeafNode = Object.keys(currentNode.child).length === 0;
    textData = this.parseTextData(
      textData,
      currentNode.tagname,
      jPath,
      false,
      currentNode[":@"] ? Object.keys(currentNode[":@"]).length !== 0 : false,
      isLeafNode
    );
    if (textData !== void 0 && textData !== "")
      currentNode.add(this.options.textNodeName, textData);
    textData = "";
  }
  return textData;
}
function isItStopNode(stopNodes, jPath, currentTagName) {
  const allNodesExp = "*." + currentTagName;
  for (const stopNodePath in stopNodes) {
    const stopNodeExp = stopNodes[stopNodePath];
    if (allNodesExp === stopNodeExp || jPath === stopNodeExp)
      return true;
  }
  return false;
}
function tagExpWithClosingIndex(xmlData, i2, closingChar = ">") {
  let attrBoundary;
  let tagExp = "";
  for (let index2 = i2; index2 < xmlData.length; index2++) {
    let ch = xmlData[index2];
    if (attrBoundary) {
      if (ch === attrBoundary)
        attrBoundary = "";
    } else if (ch === '"' || ch === "'") {
      attrBoundary = ch;
    } else if (ch === closingChar[0]) {
      if (closingChar[1]) {
        if (xmlData[index2 + 1] === closingChar[1]) {
          return {
            data: tagExp,
            index: index2
          };
        }
      } else {
        return {
          data: tagExp,
          index: index2
        };
      }
    } else if (ch === "	") {
      ch = " ";
    }
    tagExp += ch;
  }
}
function findClosingIndex(xmlData, str, i2, errMsg) {
  const closingIndex = xmlData.indexOf(str, i2);
  if (closingIndex === -1) {
    throw new Error(errMsg);
  } else {
    return closingIndex + str.length - 1;
  }
}
function readTagExp(xmlData, i2, removeNSPrefix, closingChar = ">") {
  const result = tagExpWithClosingIndex(xmlData, i2 + 1, closingChar);
  if (!result)
    return;
  let tagExp = result.data;
  const closeIndex = result.index;
  const separatorIndex = tagExp.search(/\s/);
  let tagName = tagExp;
  let attrExpPresent = true;
  if (separatorIndex !== -1) {
    tagName = tagExp.substr(0, separatorIndex).replace(/\s\s*$/, "");
    tagExp = tagExp.substr(separatorIndex + 1);
  }
  if (removeNSPrefix) {
    const colonIndex = tagName.indexOf(":");
    if (colonIndex !== -1) {
      tagName = tagName.substr(colonIndex + 1);
      attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
    }
  }
  return {
    tagName,
    tagExp,
    closeIndex,
    attrExpPresent
  };
}
function readStopNodeData(xmlData, tagName, i2) {
  const startIndex = i2;
  let openTagCount = 1;
  for (; i2 < xmlData.length; i2++) {
    if (xmlData[i2] === "<") {
      if (xmlData[i2 + 1] === "/") {
        const closeIndex = findClosingIndex(xmlData, ">", i2, `${tagName} is not closed`);
        let closeTagName = xmlData.substring(i2 + 2, closeIndex).trim();
        if (closeTagName === tagName) {
          openTagCount--;
          if (openTagCount === 0) {
            return {
              tagContent: xmlData.substring(startIndex, i2),
              i: closeIndex
            };
          }
        }
        i2 = closeIndex;
      } else if (xmlData[i2 + 1] === "?") {
        const closeIndex = findClosingIndex(xmlData, "?>", i2 + 1, "StopNode is not closed.");
        i2 = closeIndex;
      } else if (xmlData.substr(i2 + 1, 3) === "!--") {
        const closeIndex = findClosingIndex(xmlData, "-->", i2 + 3, "StopNode is not closed.");
        i2 = closeIndex;
      } else if (xmlData.substr(i2 + 1, 2) === "![") {
        const closeIndex = findClosingIndex(xmlData, "]]>", i2, "StopNode is not closed.") - 2;
        i2 = closeIndex;
      } else {
        const tagData = readTagExp(xmlData, i2, ">");
        if (tagData) {
          const openTagName = tagData && tagData.tagName;
          if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
            openTagCount++;
          }
          i2 = tagData.closeIndex;
        }
      }
    }
  }
}
function parseValue(val, shouldParse, options) {
  if (shouldParse && typeof val === "string") {
    const newval = val.trim();
    if (newval === "true")
      return true;
    else if (newval === "false")
      return false;
    else
      return toNumber(val, options);
  } else {
    if (util.isExist(val)) {
      return val;
    } else {
      return "";
    }
  }
}
var OrderedObjParser_1 = OrderedObjParser$1;
var node2json = {};
function prettify$1(node, options) {
  return compress(node, options);
}
function compress(arr, options, jPath) {
  let text;
  const compressedObj = {};
  for (let i2 = 0; i2 < arr.length; i2++) {
    const tagObj = arr[i2];
    const property = propName$1(tagObj);
    let newJpath = "";
    if (jPath === void 0)
      newJpath = property;
    else
      newJpath = jPath + "." + property;
    if (property === options.textNodeName) {
      if (text === void 0)
        text = tagObj[property];
      else
        text += "" + tagObj[property];
    } else if (property === void 0) {
      continue;
    } else if (tagObj[property]) {
      let val = compress(tagObj[property], options, newJpath);
      const isLeaf = isLeafTag(val, options);
      if (tagObj[":@"]) {
        assignAttributes(val, tagObj[":@"], newJpath, options);
      } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== void 0 && !options.alwaysCreateTextNode) {
        val = val[options.textNodeName];
      } else if (Object.keys(val).length === 0) {
        if (options.alwaysCreateTextNode)
          val[options.textNodeName] = "";
        else
          val = "";
      }
      if (compressedObj[property] !== void 0 && compressedObj.hasOwnProperty(property)) {
        if (!Array.isArray(compressedObj[property])) {
          compressedObj[property] = [compressedObj[property]];
        }
        compressedObj[property].push(val);
      } else {
        if (options.isArray(property, newJpath, isLeaf)) {
          compressedObj[property] = [val];
        } else {
          compressedObj[property] = val;
        }
      }
    }
  }
  if (typeof text === "string") {
    if (text.length > 0)
      compressedObj[options.textNodeName] = text;
  } else if (text !== void 0)
    compressedObj[options.textNodeName] = text;
  return compressedObj;
}
function propName$1(obj) {
  const keys = Object.keys(obj);
  for (let i2 = 0; i2 < keys.length; i2++) {
    const key = keys[i2];
    if (key !== ":@")
      return key;
  }
}
function assignAttributes(obj, attrMap, jpath, options) {
  if (attrMap) {
    const keys = Object.keys(attrMap);
    const len = keys.length;
    for (let i2 = 0; i2 < len; i2++) {
      const atrrName = keys[i2];
      if (options.isArray(atrrName, jpath + "." + atrrName, true, true)) {
        obj[atrrName] = [attrMap[atrrName]];
      } else {
        obj[atrrName] = attrMap[atrrName];
      }
    }
  }
}
function isLeafTag(obj, options) {
  const propCount = Object.keys(obj).length;
  if (propCount === 0 || propCount === 1 && obj[options.textNodeName])
    return true;
  return false;
}
node2json.prettify = prettify$1;
const { buildOptions } = OptionsBuilder;
const OrderedObjParser2 = OrderedObjParser_1;
const { prettify } = node2json;
const validator$1 = validator$2;
let XMLParser$1 = class XMLParser {
  constructor(options) {
    this.externalEntities = {};
    this.options = buildOptions(options);
  }
  /**
   * Parse XML dats to JS object 
   * @param {string|Buffer} xmlData 
   * @param {boolean|Object} validationOption 
   */
  parse(xmlData, validationOption) {
    if (typeof xmlData === "string")
      ;
    else if (xmlData.toString) {
      xmlData = xmlData.toString();
    } else {
      throw new Error("XML data is accepted in String or Bytes[] form.");
    }
    if (validationOption) {
      if (validationOption === true)
        validationOption = {};
      const result = validator$1.validate(xmlData, validationOption);
      if (result !== true) {
        throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
      }
    }
    const orderedObjParser = new OrderedObjParser2(this.options);
    orderedObjParser.addExternalEntities(this.externalEntities);
    const orderedResult = orderedObjParser.parseXml(xmlData);
    if (this.options.preserveOrder || orderedResult === void 0)
      return orderedResult;
    else
      return prettify(orderedResult, this.options);
  }
  /**
   * Add Entity which is not by default supported by this library
   * @param {string} key 
   * @param {string} value 
   */
  addEntity(key, value) {
    if (value.indexOf("&") !== -1) {
      throw new Error("Entity value can't have '&'");
    } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
      throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
    } else if (value === "&") {
      throw new Error("An entity with value '&' is not permitted");
    } else {
      this.externalEntities[key] = value;
    }
  }
};
var XMLParser_1 = XMLParser$1;
const EOL = "\n";
function toXml(jArray, options) {
  let indentation = "";
  if (options.format && options.indentBy.length > 0) {
    indentation = EOL;
  }
  return arrToStr(jArray, options, "", indentation);
}
function arrToStr(arr, options, jPath, indentation) {
  let xmlStr = "";
  let isPreviousElementTag = false;
  for (let i2 = 0; i2 < arr.length; i2++) {
    const tagObj = arr[i2];
    const tagName = propName(tagObj);
    let newJPath = "";
    if (jPath.length === 0)
      newJPath = tagName;
    else
      newJPath = `${jPath}.${tagName}`;
    if (tagName === options.textNodeName) {
      let tagText = tagObj[tagName];
      if (!isStopNode(newJPath, options)) {
        tagText = options.tagValueProcessor(tagName, tagText);
        tagText = replaceEntitiesValue(tagText, options);
      }
      if (isPreviousElementTag) {
        xmlStr += indentation;
      }
      xmlStr += tagText;
      isPreviousElementTag = false;
      continue;
    } else if (tagName === options.cdataPropName) {
      if (isPreviousElementTag) {
        xmlStr += indentation;
      }
      xmlStr += `<![CDATA[${tagObj[tagName][0][options.textNodeName]}]]>`;
      isPreviousElementTag = false;
      continue;
    } else if (tagName === options.commentPropName) {
      xmlStr += indentation + `<!--${tagObj[tagName][0][options.textNodeName]}-->`;
      isPreviousElementTag = true;
      continue;
    } else if (tagName[0] === "?") {
      const attStr2 = attr_to_str(tagObj[":@"], options);
      const tempInd = tagName === "?xml" ? "" : indentation;
      let piTextNodeName = tagObj[tagName][0][options.textNodeName];
      piTextNodeName = piTextNodeName.length !== 0 ? " " + piTextNodeName : "";
      xmlStr += tempInd + `<${tagName}${piTextNodeName}${attStr2}?>`;
      isPreviousElementTag = true;
      continue;
    }
    let newIdentation = indentation;
    if (newIdentation !== "") {
      newIdentation += options.indentBy;
    }
    const attStr = attr_to_str(tagObj[":@"], options);
    const tagStart = indentation + `<${tagName}${attStr}`;
    const tagValue = arrToStr(tagObj[tagName], options, newJPath, newIdentation);
    if (options.unpairedTags.indexOf(tagName) !== -1) {
      if (options.suppressUnpairedNode)
        xmlStr += tagStart + ">";
      else
        xmlStr += tagStart + "/>";
    } else if ((!tagValue || tagValue.length === 0) && options.suppressEmptyNode) {
      xmlStr += tagStart + "/>";
    } else if (tagValue && tagValue.endsWith(">")) {
      xmlStr += tagStart + `>${tagValue}${indentation}</${tagName}>`;
    } else {
      xmlStr += tagStart + ">";
      if (tagValue && indentation !== "" && (tagValue.includes("/>") || tagValue.includes("</"))) {
        xmlStr += indentation + options.indentBy + tagValue + indentation;
      } else {
        xmlStr += tagValue;
      }
      xmlStr += `</${tagName}>`;
    }
    isPreviousElementTag = true;
  }
  return xmlStr;
}
function propName(obj) {
  const keys = Object.keys(obj);
  for (let i2 = 0; i2 < keys.length; i2++) {
    const key = keys[i2];
    if (key !== ":@")
      return key;
  }
}
function attr_to_str(attrMap, options) {
  let attrStr = "";
  if (attrMap && !options.ignoreAttributes) {
    for (let attr in attrMap) {
      let attrVal = options.attributeValueProcessor(attr, attrMap[attr]);
      attrVal = replaceEntitiesValue(attrVal, options);
      if (attrVal === true && options.suppressBooleanAttributes) {
        attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}`;
      } else {
        attrStr += ` ${attr.substr(options.attributeNamePrefix.length)}="${attrVal}"`;
      }
    }
  }
  return attrStr;
}
function isStopNode(jPath, options) {
  jPath = jPath.substr(0, jPath.length - options.textNodeName.length - 1);
  let tagName = jPath.substr(jPath.lastIndexOf(".") + 1);
  for (let index2 in options.stopNodes) {
    if (options.stopNodes[index2] === jPath || options.stopNodes[index2] === "*." + tagName)
      return true;
  }
  return false;
}
function replaceEntitiesValue(textValue, options) {
  if (textValue && textValue.length > 0 && options.processEntities) {
    for (let i2 = 0; i2 < options.entities.length; i2++) {
      const entity = options.entities[i2];
      textValue = textValue.replace(entity.regex, entity.val);
    }
  }
  return textValue;
}
var orderedJs2Xml = toXml;
const buildFromOrderedJs = orderedJs2Xml;
const defaultOptions = {
  attributeNamePrefix: "@_",
  attributesGroupName: false,
  textNodeName: "#text",
  ignoreAttributes: true,
  cdataPropName: false,
  format: false,
  indentBy: "  ",
  suppressEmptyNode: false,
  suppressUnpairedNode: true,
  suppressBooleanAttributes: true,
  tagValueProcessor: function(key, a2) {
    return a2;
  },
  attributeValueProcessor: function(attrName, a2) {
    return a2;
  },
  preserveOrder: false,
  commentPropName: false,
  unpairedTags: [],
  entities: [
    { regex: new RegExp("&", "g"), val: "&amp;" },
    //it must be on top
    { regex: new RegExp(">", "g"), val: "&gt;" },
    { regex: new RegExp("<", "g"), val: "&lt;" },
    { regex: new RegExp("'", "g"), val: "&apos;" },
    { regex: new RegExp('"', "g"), val: "&quot;" }
  ],
  processEntities: true,
  stopNodes: []
  // transformTagName: false,
  // transformAttributeName: false,
};
function Builder(options) {
  this.options = Object.assign({}, defaultOptions, options);
  if (this.options.ignoreAttributes || this.options.attributesGroupName) {
    this.isAttribute = function() {
      return false;
    };
  } else {
    this.attrPrefixLen = this.options.attributeNamePrefix.length;
    this.isAttribute = isAttribute;
  }
  this.processTextOrObjNode = processTextOrObjNode;
  if (this.options.format) {
    this.indentate = indentate;
    this.tagEndChar = ">\n";
    this.newLine = "\n";
  } else {
    this.indentate = function() {
      return "";
    };
    this.tagEndChar = ">";
    this.newLine = "";
  }
}
Builder.prototype.build = function(jObj) {
  if (this.options.preserveOrder) {
    return buildFromOrderedJs(jObj, this.options);
  } else {
    if (Array.isArray(jObj) && this.options.arrayNodeName && this.options.arrayNodeName.length > 1) {
      jObj = {
        [this.options.arrayNodeName]: jObj
      };
    }
    return this.j2x(jObj, 0).val;
  }
};
Builder.prototype.j2x = function(jObj, level) {
  let attrStr = "";
  let val = "";
  for (let key in jObj) {
    if (typeof jObj[key] === "undefined")
      ;
    else if (jObj[key] === null) {
      if (key[0] === "?")
        val += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
      else
        val += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
    } else if (jObj[key] instanceof Date) {
      val += this.buildTextValNode(jObj[key], key, "", level);
    } else if (typeof jObj[key] !== "object") {
      const attr = this.isAttribute(key);
      if (attr) {
        attrStr += this.buildAttrPairStr(attr, "" + jObj[key]);
      } else {
        if (key === this.options.textNodeName) {
          let newval = this.options.tagValueProcessor(key, "" + jObj[key]);
          val += this.replaceEntitiesValue(newval);
        } else {
          val += this.buildTextValNode(jObj[key], key, "", level);
        }
      }
    } else if (Array.isArray(jObj[key])) {
      const arrLen = jObj[key].length;
      for (let j2 = 0; j2 < arrLen; j2++) {
        const item = jObj[key][j2];
        if (typeof item === "undefined")
          ;
        else if (item === null) {
          if (key[0] === "?")
            val += this.indentate(level) + "<" + key + "?" + this.tagEndChar;
          else
            val += this.indentate(level) + "<" + key + "/" + this.tagEndChar;
        } else if (typeof item === "object") {
          val += this.processTextOrObjNode(item, key, level);
        } else {
          val += this.buildTextValNode(item, key, "", level);
        }
      }
    } else {
      if (this.options.attributesGroupName && key === this.options.attributesGroupName) {
        const Ks = Object.keys(jObj[key]);
        const L2 = Ks.length;
        for (let j2 = 0; j2 < L2; j2++) {
          attrStr += this.buildAttrPairStr(Ks[j2], "" + jObj[key][Ks[j2]]);
        }
      } else {
        val += this.processTextOrObjNode(jObj[key], key, level);
      }
    }
  }
  return { attrStr, val };
};
Builder.prototype.buildAttrPairStr = function(attrName, val) {
  val = this.options.attributeValueProcessor(attrName, "" + val);
  val = this.replaceEntitiesValue(val);
  if (this.options.suppressBooleanAttributes && val === "true") {
    return " " + attrName;
  } else
    return " " + attrName + '="' + val + '"';
};
function processTextOrObjNode(object, key, level) {
  const result = this.j2x(object, level + 1);
  if (object[this.options.textNodeName] !== void 0 && Object.keys(object).length === 1) {
    return this.buildTextValNode(object[this.options.textNodeName], key, result.attrStr, level);
  } else {
    return this.buildObjectNode(result.val, key, result.attrStr, level);
  }
}
Builder.prototype.buildObjectNode = function(val, key, attrStr, level) {
  if (val === "") {
    if (key[0] === "?")
      return this.indentate(level) + "<" + key + attrStr + "?" + this.tagEndChar;
    else {
      return this.indentate(level) + "<" + key + attrStr + this.closeTag(key) + this.tagEndChar;
    }
  } else {
    let tagEndExp = "</" + key + this.tagEndChar;
    let piClosingChar = "";
    if (key[0] === "?") {
      piClosingChar = "?";
      tagEndExp = "";
    }
    if (attrStr && val.indexOf("<") === -1) {
      return this.indentate(level) + "<" + key + attrStr + piClosingChar + ">" + val + tagEndExp;
    } else if (this.options.commentPropName !== false && key === this.options.commentPropName && piClosingChar.length === 0) {
      return this.indentate(level) + `<!--${val}-->` + this.newLine;
    } else {
      return this.indentate(level) + "<" + key + attrStr + piClosingChar + this.tagEndChar + val + this.indentate(level) + tagEndExp;
    }
  }
};
Builder.prototype.closeTag = function(key) {
  let closeTag = "";
  if (this.options.unpairedTags.indexOf(key) !== -1) {
    if (!this.options.suppressUnpairedNode)
      closeTag = "/";
  } else if (this.options.suppressEmptyNode) {
    closeTag = "/";
  } else {
    closeTag = `></${key}`;
  }
  return closeTag;
};
Builder.prototype.buildTextValNode = function(val, key, attrStr, level) {
  if (this.options.cdataPropName !== false && key === this.options.cdataPropName) {
    return this.indentate(level) + `<![CDATA[${val}]]>` + this.newLine;
  } else if (this.options.commentPropName !== false && key === this.options.commentPropName) {
    return this.indentate(level) + `<!--${val}-->` + this.newLine;
  } else if (key[0] === "?") {
    return this.indentate(level) + "<" + key + attrStr + "?" + this.tagEndChar;
  } else {
    let textValue = this.options.tagValueProcessor(key, val);
    textValue = this.replaceEntitiesValue(textValue);
    if (textValue === "") {
      return this.indentate(level) + "<" + key + attrStr + this.closeTag(key) + this.tagEndChar;
    } else {
      return this.indentate(level) + "<" + key + attrStr + ">" + textValue + "</" + key + this.tagEndChar;
    }
  }
};
Builder.prototype.replaceEntitiesValue = function(textValue) {
  if (textValue && textValue.length > 0 && this.options.processEntities) {
    for (let i2 = 0; i2 < this.options.entities.length; i2++) {
      const entity = this.options.entities[i2];
      textValue = textValue.replace(entity.regex, entity.val);
    }
  }
  return textValue;
};
function indentate(level) {
  return this.options.indentBy.repeat(level);
}
function isAttribute(name2) {
  if (name2.startsWith(this.options.attributeNamePrefix)) {
    return name2.substr(this.attrPrefixLen);
  } else {
    return false;
  }
}
var json2xml = Builder;
const validator = validator$2;
const XMLParser2 = XMLParser_1;
const XMLBuilder = json2xml;
var fxp = {
  XMLParser: XMLParser2,
  XMLValidator: validator,
  XMLBuilder
};
const serializeAws_queryAssumeRoleCommand = async (input, context) => {
  const headers = {
    "content-type": "application/x-www-form-urlencoded"
  };
  let body;
  body = buildFormUrlencodedString({
    ...serializeAws_queryAssumeRoleRequest(input),
    Action: "AssumeRole",
    Version: "2011-06-15"
  });
  return buildHttpRpcRequest(context, headers, "/", void 0, body);
};
const serializeAws_queryAssumeRoleWithWebIdentityCommand = async (input, context) => {
  const headers = {
    "content-type": "application/x-www-form-urlencoded"
  };
  let body;
  body = buildFormUrlencodedString({
    ...serializeAws_queryAssumeRoleWithWebIdentityRequest(input),
    Action: "AssumeRoleWithWebIdentity",
    Version: "2011-06-15"
  });
  return buildHttpRpcRequest(context, headers, "/", void 0, body);
};
const deserializeAws_queryAssumeRoleCommand = async (output, context) => {
  if (output.statusCode >= 300) {
    return deserializeAws_queryAssumeRoleCommandError(output, context);
  }
  const data = await parseBody$2(output.body, context);
  let contents = {};
  contents = deserializeAws_queryAssumeRoleResponse(data.AssumeRoleResult);
  const response = {
    $metadata: deserializeMetadata$2(output),
    ...contents
  };
  return Promise.resolve(response);
};
const deserializeAws_queryAssumeRoleCommandError = async (output, context) => {
  const parsedOutput = {
    ...output,
    body: await parseErrorBody$2(output.body, context)
  };
  const errorCode = loadQueryErrorCode(output, parsedOutput.body);
  switch (errorCode) {
    case "ExpiredTokenException":
    case "com.amazonaws.sts#ExpiredTokenException":
      throw await deserializeAws_queryExpiredTokenExceptionResponse(parsedOutput);
    case "MalformedPolicyDocument":
    case "com.amazonaws.sts#MalformedPolicyDocumentException":
      throw await deserializeAws_queryMalformedPolicyDocumentExceptionResponse(parsedOutput);
    case "PackedPolicyTooLarge":
    case "com.amazonaws.sts#PackedPolicyTooLargeException":
      throw await deserializeAws_queryPackedPolicyTooLargeExceptionResponse(parsedOutput);
    case "RegionDisabledException":
    case "com.amazonaws.sts#RegionDisabledException":
      throw await deserializeAws_queryRegionDisabledExceptionResponse(parsedOutput);
    default:
      const parsedBody = parsedOutput.body;
      throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        exceptionCtor: STSServiceException,
        errorCode
      });
  }
};
const deserializeAws_queryAssumeRoleWithWebIdentityCommand = async (output, context) => {
  if (output.statusCode >= 300) {
    return deserializeAws_queryAssumeRoleWithWebIdentityCommandError(output, context);
  }
  const data = await parseBody$2(output.body, context);
  let contents = {};
  contents = deserializeAws_queryAssumeRoleWithWebIdentityResponse(data.AssumeRoleWithWebIdentityResult);
  const response = {
    $metadata: deserializeMetadata$2(output),
    ...contents
  };
  return Promise.resolve(response);
};
const deserializeAws_queryAssumeRoleWithWebIdentityCommandError = async (output, context) => {
  const parsedOutput = {
    ...output,
    body: await parseErrorBody$2(output.body, context)
  };
  const errorCode = loadQueryErrorCode(output, parsedOutput.body);
  switch (errorCode) {
    case "ExpiredTokenException":
    case "com.amazonaws.sts#ExpiredTokenException":
      throw await deserializeAws_queryExpiredTokenExceptionResponse(parsedOutput);
    case "IDPCommunicationError":
    case "com.amazonaws.sts#IDPCommunicationErrorException":
      throw await deserializeAws_queryIDPCommunicationErrorExceptionResponse(parsedOutput);
    case "IDPRejectedClaim":
    case "com.amazonaws.sts#IDPRejectedClaimException":
      throw await deserializeAws_queryIDPRejectedClaimExceptionResponse(parsedOutput);
    case "InvalidIdentityToken":
    case "com.amazonaws.sts#InvalidIdentityTokenException":
      throw await deserializeAws_queryInvalidIdentityTokenExceptionResponse(parsedOutput);
    case "MalformedPolicyDocument":
    case "com.amazonaws.sts#MalformedPolicyDocumentException":
      throw await deserializeAws_queryMalformedPolicyDocumentExceptionResponse(parsedOutput);
    case "PackedPolicyTooLarge":
    case "com.amazonaws.sts#PackedPolicyTooLargeException":
      throw await deserializeAws_queryPackedPolicyTooLargeExceptionResponse(parsedOutput);
    case "RegionDisabledException":
    case "com.amazonaws.sts#RegionDisabledException":
      throw await deserializeAws_queryRegionDisabledExceptionResponse(parsedOutput);
    default:
      const parsedBody = parsedOutput.body;
      throwDefaultError({
        output,
        parsedBody: parsedBody.Error,
        exceptionCtor: STSServiceException,
        errorCode
      });
  }
};
const deserializeAws_queryExpiredTokenExceptionResponse = async (parsedOutput, context) => {
  const body = parsedOutput.body;
  const deserialized = deserializeAws_queryExpiredTokenException(body.Error);
  const exception = new ExpiredTokenException$1({
    $metadata: deserializeMetadata$2(parsedOutput),
    ...deserialized
  });
  return decorateServiceException(exception, body);
};
const deserializeAws_queryIDPCommunicationErrorExceptionResponse = async (parsedOutput, context) => {
  const body = parsedOutput.body;
  const deserialized = deserializeAws_queryIDPCommunicationErrorException(body.Error);
  const exception = new IDPCommunicationErrorException({
    $metadata: deserializeMetadata$2(parsedOutput),
    ...deserialized
  });
  return decorateServiceException(exception, body);
};
const deserializeAws_queryIDPRejectedClaimExceptionResponse = async (parsedOutput, context) => {
  const body = parsedOutput.body;
  const deserialized = deserializeAws_queryIDPRejectedClaimException(body.Error);
  const exception = new IDPRejectedClaimException({
    $metadata: deserializeMetadata$2(parsedOutput),
    ...deserialized
  });
  return decorateServiceException(exception, body);
};
const deserializeAws_queryInvalidIdentityTokenExceptionResponse = async (parsedOutput, context) => {
  const body = parsedOutput.body;
  const deserialized = deserializeAws_queryInvalidIdentityTokenException(body.Error);
  const exception = new InvalidIdentityTokenException({
    $metadata: deserializeMetadata$2(parsedOutput),
    ...deserialized
  });
  return decorateServiceException(exception, body);
};
const deserializeAws_queryMalformedPolicyDocumentExceptionResponse = async (parsedOutput, context) => {
  const body = parsedOutput.body;
  const deserialized = deserializeAws_queryMalformedPolicyDocumentException(body.Error);
  const exception = new MalformedPolicyDocumentException({
    $metadata: deserializeMetadata$2(parsedOutput),
    ...deserialized
  });
  return decorateServiceException(exception, body);
};
const deserializeAws_queryPackedPolicyTooLargeExceptionResponse = async (parsedOutput, context) => {
  const body = parsedOutput.body;
  const deserialized = deserializeAws_queryPackedPolicyTooLargeException(body.Error);
  const exception = new PackedPolicyTooLargeException({
    $metadata: deserializeMetadata$2(parsedOutput),
    ...deserialized
  });
  return decorateServiceException(exception, body);
};
const deserializeAws_queryRegionDisabledExceptionResponse = async (parsedOutput, context) => {
  const body = parsedOutput.body;
  const deserialized = deserializeAws_queryRegionDisabledException(body.Error);
  const exception = new RegionDisabledException({
    $metadata: deserializeMetadata$2(parsedOutput),
    ...deserialized
  });
  return decorateServiceException(exception, body);
};
const serializeAws_queryAssumeRoleRequest = (input, context) => {
  const entries = {};
  if (input.RoleArn != null) {
    entries["RoleArn"] = input.RoleArn;
  }
  if (input.RoleSessionName != null) {
    entries["RoleSessionName"] = input.RoleSessionName;
  }
  if (input.PolicyArns != null) {
    const memberEntries = serializeAws_querypolicyDescriptorListType(input.PolicyArns);
    if (input.PolicyArns?.length === 0) {
      entries.PolicyArns = [];
    }
    Object.entries(memberEntries).forEach(([key, value]) => {
      const loc = `PolicyArns.${key}`;
      entries[loc] = value;
    });
  }
  if (input.Policy != null) {
    entries["Policy"] = input.Policy;
  }
  if (input.DurationSeconds != null) {
    entries["DurationSeconds"] = input.DurationSeconds;
  }
  if (input.Tags != null) {
    const memberEntries = serializeAws_querytagListType(input.Tags);
    if (input.Tags?.length === 0) {
      entries.Tags = [];
    }
    Object.entries(memberEntries).forEach(([key, value]) => {
      const loc = `Tags.${key}`;
      entries[loc] = value;
    });
  }
  if (input.TransitiveTagKeys != null) {
    const memberEntries = serializeAws_querytagKeyListType(input.TransitiveTagKeys);
    if (input.TransitiveTagKeys?.length === 0) {
      entries.TransitiveTagKeys = [];
    }
    Object.entries(memberEntries).forEach(([key, value]) => {
      const loc = `TransitiveTagKeys.${key}`;
      entries[loc] = value;
    });
  }
  if (input.ExternalId != null) {
    entries["ExternalId"] = input.ExternalId;
  }
  if (input.SerialNumber != null) {
    entries["SerialNumber"] = input.SerialNumber;
  }
  if (input.TokenCode != null) {
    entries["TokenCode"] = input.TokenCode;
  }
  if (input.SourceIdentity != null) {
    entries["SourceIdentity"] = input.SourceIdentity;
  }
  return entries;
};
const serializeAws_queryAssumeRoleWithWebIdentityRequest = (input, context) => {
  const entries = {};
  if (input.RoleArn != null) {
    entries["RoleArn"] = input.RoleArn;
  }
  if (input.RoleSessionName != null) {
    entries["RoleSessionName"] = input.RoleSessionName;
  }
  if (input.WebIdentityToken != null) {
    entries["WebIdentityToken"] = input.WebIdentityToken;
  }
  if (input.ProviderId != null) {
    entries["ProviderId"] = input.ProviderId;
  }
  if (input.PolicyArns != null) {
    const memberEntries = serializeAws_querypolicyDescriptorListType(input.PolicyArns);
    if (input.PolicyArns?.length === 0) {
      entries.PolicyArns = [];
    }
    Object.entries(memberEntries).forEach(([key, value]) => {
      const loc = `PolicyArns.${key}`;
      entries[loc] = value;
    });
  }
  if (input.Policy != null) {
    entries["Policy"] = input.Policy;
  }
  if (input.DurationSeconds != null) {
    entries["DurationSeconds"] = input.DurationSeconds;
  }
  return entries;
};
const serializeAws_querypolicyDescriptorListType = (input, context) => {
  const entries = {};
  let counter = 1;
  for (const entry of input) {
    if (entry === null) {
      continue;
    }
    const memberEntries = serializeAws_queryPolicyDescriptorType(entry);
    Object.entries(memberEntries).forEach(([key, value]) => {
      entries[`member.${counter}.${key}`] = value;
    });
    counter++;
  }
  return entries;
};
const serializeAws_queryPolicyDescriptorType = (input, context) => {
  const entries = {};
  if (input.arn != null) {
    entries["arn"] = input.arn;
  }
  return entries;
};
const serializeAws_queryTag = (input, context) => {
  const entries = {};
  if (input.Key != null) {
    entries["Key"] = input.Key;
  }
  if (input.Value != null) {
    entries["Value"] = input.Value;
  }
  return entries;
};
const serializeAws_querytagKeyListType = (input, context) => {
  const entries = {};
  let counter = 1;
  for (const entry of input) {
    if (entry === null) {
      continue;
    }
    entries[`member.${counter}`] = entry;
    counter++;
  }
  return entries;
};
const serializeAws_querytagListType = (input, context) => {
  const entries = {};
  let counter = 1;
  for (const entry of input) {
    if (entry === null) {
      continue;
    }
    const memberEntries = serializeAws_queryTag(entry);
    Object.entries(memberEntries).forEach(([key, value]) => {
      entries[`member.${counter}.${key}`] = value;
    });
    counter++;
  }
  return entries;
};
const deserializeAws_queryAssumedRoleUser = (output, context) => {
  const contents = {
    AssumedRoleId: void 0,
    Arn: void 0
  };
  if (output["AssumedRoleId"] !== void 0) {
    contents.AssumedRoleId = expectString(output["AssumedRoleId"]);
  }
  if (output["Arn"] !== void 0) {
    contents.Arn = expectString(output["Arn"]);
  }
  return contents;
};
const deserializeAws_queryAssumeRoleResponse = (output, context) => {
  const contents = {
    Credentials: void 0,
    AssumedRoleUser: void 0,
    PackedPolicySize: void 0,
    SourceIdentity: void 0
  };
  if (output["Credentials"] !== void 0) {
    contents.Credentials = deserializeAws_queryCredentials(output["Credentials"]);
  }
  if (output["AssumedRoleUser"] !== void 0) {
    contents.AssumedRoleUser = deserializeAws_queryAssumedRoleUser(output["AssumedRoleUser"]);
  }
  if (output["PackedPolicySize"] !== void 0) {
    contents.PackedPolicySize = strictParseInt32(output["PackedPolicySize"]);
  }
  if (output["SourceIdentity"] !== void 0) {
    contents.SourceIdentity = expectString(output["SourceIdentity"]);
  }
  return contents;
};
const deserializeAws_queryAssumeRoleWithWebIdentityResponse = (output, context) => {
  const contents = {
    Credentials: void 0,
    SubjectFromWebIdentityToken: void 0,
    AssumedRoleUser: void 0,
    PackedPolicySize: void 0,
    Provider: void 0,
    Audience: void 0,
    SourceIdentity: void 0
  };
  if (output["Credentials"] !== void 0) {
    contents.Credentials = deserializeAws_queryCredentials(output["Credentials"]);
  }
  if (output["SubjectFromWebIdentityToken"] !== void 0) {
    contents.SubjectFromWebIdentityToken = expectString(output["SubjectFromWebIdentityToken"]);
  }
  if (output["AssumedRoleUser"] !== void 0) {
    contents.AssumedRoleUser = deserializeAws_queryAssumedRoleUser(output["AssumedRoleUser"]);
  }
  if (output["PackedPolicySize"] !== void 0) {
    contents.PackedPolicySize = strictParseInt32(output["PackedPolicySize"]);
  }
  if (output["Provider"] !== void 0) {
    contents.Provider = expectString(output["Provider"]);
  }
  if (output["Audience"] !== void 0) {
    contents.Audience = expectString(output["Audience"]);
  }
  if (output["SourceIdentity"] !== void 0) {
    contents.SourceIdentity = expectString(output["SourceIdentity"]);
  }
  return contents;
};
const deserializeAws_queryCredentials = (output, context) => {
  const contents = {
    AccessKeyId: void 0,
    SecretAccessKey: void 0,
    SessionToken: void 0,
    Expiration: void 0
  };
  if (output["AccessKeyId"] !== void 0) {
    contents.AccessKeyId = expectString(output["AccessKeyId"]);
  }
  if (output["SecretAccessKey"] !== void 0) {
    contents.SecretAccessKey = expectString(output["SecretAccessKey"]);
  }
  if (output["SessionToken"] !== void 0) {
    contents.SessionToken = expectString(output["SessionToken"]);
  }
  if (output["Expiration"] !== void 0) {
    contents.Expiration = expectNonNull(parseRfc3339DateTimeWithOffset(output["Expiration"]));
  }
  return contents;
};
const deserializeAws_queryExpiredTokenException = (output, context) => {
  const contents = {
    message: void 0
  };
  if (output["message"] !== void 0) {
    contents.message = expectString(output["message"]);
  }
  return contents;
};
const deserializeAws_queryIDPCommunicationErrorException = (output, context) => {
  const contents = {
    message: void 0
  };
  if (output["message"] !== void 0) {
    contents.message = expectString(output["message"]);
  }
  return contents;
};
const deserializeAws_queryIDPRejectedClaimException = (output, context) => {
  const contents = {
    message: void 0
  };
  if (output["message"] !== void 0) {
    contents.message = expectString(output["message"]);
  }
  return contents;
};
const deserializeAws_queryInvalidIdentityTokenException = (output, context) => {
  const contents = {
    message: void 0
  };
  if (output["message"] !== void 0) {
    contents.message = expectString(output["message"]);
  }
  return contents;
};
const deserializeAws_queryMalformedPolicyDocumentException = (output, context) => {
  const contents = {
    message: void 0
  };
  if (output["message"] !== void 0) {
    contents.message = expectString(output["message"]);
  }
  return contents;
};
const deserializeAws_queryPackedPolicyTooLargeException = (output, context) => {
  const contents = {
    message: void 0
  };
  if (output["message"] !== void 0) {
    contents.message = expectString(output["message"]);
  }
  return contents;
};
const deserializeAws_queryRegionDisabledException = (output, context) => {
  const contents = {
    message: void 0
  };
  if (output["message"] !== void 0) {
    contents.message = expectString(output["message"]);
  }
  return contents;
};
const deserializeMetadata$2 = (output) => ({
  httpStatusCode: output.statusCode,
  requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
  extendedRequestId: output.headers["x-amz-id-2"],
  cfId: output.headers["x-amz-cf-id"]
});
const collectBody$2 = (streamBody = new Uint8Array(), context) => {
  if (streamBody instanceof Uint8Array) {
    return Promise.resolve(streamBody);
  }
  return context.streamCollector(streamBody) || Promise.resolve(new Uint8Array());
};
const collectBodyString$2 = (streamBody, context) => collectBody$2(streamBody, context).then((body) => context.utf8Encoder(body));
const buildHttpRpcRequest = async (context, headers, path, resolvedHostname, body) => {
  const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
  const contents = {
    protocol,
    hostname,
    port,
    method: "POST",
    path: basePath.endsWith("/") ? basePath.slice(0, -1) + path : basePath + path,
    headers
  };
  if (resolvedHostname !== void 0) {
    contents.hostname = resolvedHostname;
  }
  if (body !== void 0) {
    contents.body = body;
  }
  return new HttpRequest(contents);
};
const parseBody$2 = (streamBody, context) => collectBodyString$2(streamBody, context).then((encoded) => {
  if (encoded.length) {
    const parser = new fxp.XMLParser({
      attributeNamePrefix: "",
      htmlEntities: true,
      ignoreAttributes: false,
      ignoreDeclaration: true,
      parseTagValue: false,
      trimValues: false,
      tagValueProcessor: (_, val) => val.trim() === "" && val.includes("\n") ? "" : void 0
    });
    parser.addEntity("#xD", "\r");
    parser.addEntity("#10", "\n");
    const parsedObj = parser.parse(encoded);
    const textNodeName = "#text";
    const key = Object.keys(parsedObj)[0];
    const parsedObjToReturn = parsedObj[key];
    if (parsedObjToReturn[textNodeName]) {
      parsedObjToReturn[key] = parsedObjToReturn[textNodeName];
      delete parsedObjToReturn[textNodeName];
    }
    return getValueFromTextNode(parsedObjToReturn);
  }
  return {};
});
const parseErrorBody$2 = async (errorBody, context) => {
  const value = await parseBody$2(errorBody, context);
  if (value.Error) {
    value.Error.message = value.Error.message ?? value.Error.Message;
  }
  return value;
};
const buildFormUrlencodedString = (formEntries) => Object.entries(formEntries).map(([key, value]) => extendedEncodeURIComponent(key) + "=" + extendedEncodeURIComponent(value)).join("&");
const loadQueryErrorCode = (output, data) => {
  if (data.Error?.Code !== void 0) {
    return data.Error.Code;
  }
  if (output.statusCode == 404) {
    return "NotFound";
  }
};
class AssumeRoleCommand extends Command {
  constructor(input) {
    super();
    this.input = input;
  }
  static getEndpointParameterInstructions() {
    return {
      UseGlobalEndpoint: { type: "builtInParams", name: "useGlobalEndpoint" },
      UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
      Endpoint: { type: "builtInParams", name: "endpoint" },
      Region: { type: "builtInParams", name: "region" },
      UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" }
    };
  }
  resolveMiddleware(clientStack, configuration, options) {
    this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
    this.middlewareStack.use(getEndpointPlugin(configuration, AssumeRoleCommand.getEndpointParameterInstructions()));
    this.middlewareStack.use(getAwsAuthPlugin(configuration));
    const stack = clientStack.concat(this.middlewareStack);
    const { logger: logger2 } = configuration;
    const clientName = "STSClient";
    const commandName = "AssumeRoleCommand";
    const handlerExecutionContext = {
      logger: logger2,
      clientName,
      commandName,
      inputFilterSensitiveLog: AssumeRoleRequestFilterSensitiveLog,
      outputFilterSensitiveLog: AssumeRoleResponseFilterSensitiveLog
    };
    const { requestHandler } = configuration;
    return stack.resolve((request2) => requestHandler.handle(request2.request, options || {}), handlerExecutionContext);
  }
  serialize(input, context) {
    return serializeAws_queryAssumeRoleCommand(input, context);
  }
  deserialize(output, context) {
    return deserializeAws_queryAssumeRoleCommand(output, context);
  }
}
class AssumeRoleWithWebIdentityCommand extends Command {
  constructor(input) {
    super();
    this.input = input;
  }
  static getEndpointParameterInstructions() {
    return {
      UseGlobalEndpoint: { type: "builtInParams", name: "useGlobalEndpoint" },
      UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
      Endpoint: { type: "builtInParams", name: "endpoint" },
      Region: { type: "builtInParams", name: "region" },
      UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" }
    };
  }
  resolveMiddleware(clientStack, configuration, options) {
    this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
    this.middlewareStack.use(getEndpointPlugin(configuration, AssumeRoleWithWebIdentityCommand.getEndpointParameterInstructions()));
    const stack = clientStack.concat(this.middlewareStack);
    const { logger: logger2 } = configuration;
    const clientName = "STSClient";
    const commandName = "AssumeRoleWithWebIdentityCommand";
    const handlerExecutionContext = {
      logger: logger2,
      clientName,
      commandName,
      inputFilterSensitiveLog: AssumeRoleWithWebIdentityRequestFilterSensitiveLog,
      outputFilterSensitiveLog: AssumeRoleWithWebIdentityResponseFilterSensitiveLog
    };
    const { requestHandler } = configuration;
    return stack.resolve((request2) => requestHandler.handle(request2.request, options || {}), handlerExecutionContext);
  }
  serialize(input, context) {
    return serializeAws_queryAssumeRoleWithWebIdentityCommand(input, context);
  }
  deserialize(output, context) {
    return deserializeAws_queryAssumeRoleWithWebIdentityCommand(output, context);
  }
}
const resolveStsAuthConfig = (input, { stsClientCtor }) => resolveAwsAuthConfig({
  ...input,
  stsClientCtor
});
const resolveClientEndpointParameters$2 = (options) => {
  return {
    ...options,
    useDualstackEndpoint: options.useDualstackEndpoint ?? false,
    useFipsEndpoint: options.useFipsEndpoint ?? false,
    useGlobalEndpoint: options.useGlobalEndpoint ?? false,
    defaultSigningName: "sts"
  };
};
const name$2 = "@aws-sdk/client-sts";
const description$2 = "AWS SDK for JavaScript Sts Client for Node.js, Browser and React Native";
const version$3 = "3.279.0";
const scripts$2 = {
  build: "concurrently 'yarn:build:cjs' 'yarn:build:es' 'yarn:build:types'",
  "build:cjs": "tsc -p tsconfig.cjs.json",
  "build:docs": "typedoc",
  "build:es": "tsc -p tsconfig.es.json",
  "build:include:deps": "lerna run --scope $npm_package_name --include-dependencies build",
  "build:types": "tsc -p tsconfig.types.json",
  "build:types:downlevel": "downlevel-dts dist-types dist-types/ts3.4",
  clean: "rimraf ./dist-* && rimraf *.tsbuildinfo",
  "generate:client": "node ../../scripts/generate-clients/single-service --solo sts",
  test: "yarn test:unit",
  "test:unit": "jest"
};
const main$2 = "./dist-cjs/index.js";
const types$2 = "./dist-types/index.d.ts";
const module$3 = "./dist-es/index.js";
const sideEffects$2 = false;
const dependencies$2 = {
  "@aws-crypto/sha256-browser": "3.0.0",
  "@aws-crypto/sha256-js": "3.0.0",
  "@aws-sdk/config-resolver": "3.272.0",
  "@aws-sdk/credential-provider-node": "3.279.0",
  "@aws-sdk/fetch-http-handler": "3.272.0",
  "@aws-sdk/hash-node": "3.272.0",
  "@aws-sdk/invalid-dependency": "3.272.0",
  "@aws-sdk/middleware-content-length": "3.272.0",
  "@aws-sdk/middleware-endpoint": "3.272.0",
  "@aws-sdk/middleware-host-header": "3.278.0",
  "@aws-sdk/middleware-logger": "3.272.0",
  "@aws-sdk/middleware-recursion-detection": "3.272.0",
  "@aws-sdk/middleware-retry": "3.272.0",
  "@aws-sdk/middleware-sdk-sts": "3.272.0",
  "@aws-sdk/middleware-serde": "3.272.0",
  "@aws-sdk/middleware-signing": "3.272.0",
  "@aws-sdk/middleware-stack": "3.272.0",
  "@aws-sdk/middleware-user-agent": "3.272.0",
  "@aws-sdk/node-config-provider": "3.272.0",
  "@aws-sdk/node-http-handler": "3.272.0",
  "@aws-sdk/protocol-http": "3.272.0",
  "@aws-sdk/smithy-client": "3.279.0",
  "@aws-sdk/types": "3.272.0",
  "@aws-sdk/url-parser": "3.272.0",
  "@aws-sdk/util-base64": "3.208.0",
  "@aws-sdk/util-body-length-browser": "3.188.0",
  "@aws-sdk/util-body-length-node": "3.208.0",
  "@aws-sdk/util-defaults-mode-browser": "3.279.0",
  "@aws-sdk/util-defaults-mode-node": "3.279.0",
  "@aws-sdk/util-endpoints": "3.272.0",
  "@aws-sdk/util-retry": "3.272.0",
  "@aws-sdk/util-user-agent-browser": "3.272.0",
  "@aws-sdk/util-user-agent-node": "3.272.0",
  "@aws-sdk/util-utf8": "3.254.0",
  "fast-xml-parser": "4.1.2",
  tslib: "^2.3.1"
};
const devDependencies$2 = {
  "@aws-sdk/service-client-documentation-generator": "3.208.0",
  "@tsconfig/node14": "1.0.3",
  "@types/node": "^14.14.31",
  concurrently: "7.0.0",
  "downlevel-dts": "0.10.1",
  rimraf: "3.0.2",
  typedoc: "0.19.2",
  typescript: "~4.6.2"
};
const overrides$2 = {
  typedoc: {
    typescript: "~4.6.2"
  }
};
const engines$2 = {
  node: ">=14.0.0"
};
const typesVersions$2 = {
  "<4.0": {
    "dist-types/*": [
      "dist-types/ts3.4/*"
    ]
  }
};
const files$2 = [
  "dist-*"
];
const author$2 = {
  name: "AWS SDK for JavaScript Team",
  url: "https://aws.amazon.com/javascript/"
};
const license$2 = "Apache-2.0";
const browser$2 = {
  "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.browser"
};
const homepage$2 = "https://github.com/aws/aws-sdk-js-v3/tree/main/clients/client-sts";
const repository$2 = {
  type: "git",
  url: "https://github.com/aws/aws-sdk-js-v3.git",
  directory: "clients/client-sts"
};
const packageInfo$2 = {
  name: name$2,
  description: description$2,
  version: version$3,
  scripts: scripts$2,
  main: main$2,
  types: types$2,
  module: module$3,
  sideEffects: sideEffects$2,
  dependencies: dependencies$2,
  devDependencies: devDependencies$2,
  overrides: overrides$2,
  engines: engines$2,
  typesVersions: typesVersions$2,
  files: files$2,
  author: author$2,
  license: license$2,
  browser: browser$2,
  "react-native": {
    "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.native"
  },
  homepage: homepage$2,
  repository: repository$2
};
const ASSUME_ROLE_DEFAULT_REGION = "us-east-1";
const decorateDefaultRegion = (region) => {
  if (typeof region !== "function") {
    return region === void 0 ? ASSUME_ROLE_DEFAULT_REGION : region;
  }
  return async () => {
    try {
      return await region();
    } catch (e2) {
      return ASSUME_ROLE_DEFAULT_REGION;
    }
  };
};
const getDefaultRoleAssumer$1 = (stsOptions, stsClientCtor) => {
  let stsClient;
  let closureSourceCreds;
  return async (sourceCreds, params) => {
    closureSourceCreds = sourceCreds;
    if (!stsClient) {
      const { logger: logger2, region, requestHandler } = stsOptions;
      stsClient = new stsClientCtor({
        logger: logger2,
        credentialDefaultProvider: () => async () => closureSourceCreds,
        region: decorateDefaultRegion(region || stsOptions.region),
        ...requestHandler ? { requestHandler } : {}
      });
    }
    const { Credentials } = await stsClient.send(new AssumeRoleCommand(params));
    if (!Credentials || !Credentials.AccessKeyId || !Credentials.SecretAccessKey) {
      throw new Error(`Invalid response from STS.assumeRole call with role ${params.RoleArn}`);
    }
    return {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey,
      sessionToken: Credentials.SessionToken,
      expiration: Credentials.Expiration
    };
  };
};
const getDefaultRoleAssumerWithWebIdentity$1 = (stsOptions, stsClientCtor) => {
  let stsClient;
  return async (params) => {
    if (!stsClient) {
      const { logger: logger2, region, requestHandler } = stsOptions;
      stsClient = new stsClientCtor({
        logger: logger2,
        region: decorateDefaultRegion(region || stsOptions.region),
        ...requestHandler ? { requestHandler } : {}
      });
    }
    const { Credentials } = await stsClient.send(new AssumeRoleWithWebIdentityCommand(params));
    if (!Credentials || !Credentials.AccessKeyId || !Credentials.SecretAccessKey) {
      throw new Error(`Invalid response from STS.assumeRoleWithWebIdentity call with role ${params.RoleArn}`);
    }
    return {
      accessKeyId: Credentials.AccessKeyId,
      secretAccessKey: Credentials.SecretAccessKey,
      sessionToken: Credentials.SessionToken,
      expiration: Credentials.Expiration
    };
  };
};
const decorateDefaultCredentialProvider$1 = (provider) => (input) => provider({
  roleAssumer: getDefaultRoleAssumer$1(input, input.stsClientCtor),
  roleAssumerWithWebIdentity: getDefaultRoleAssumerWithWebIdentity$1(input, input.stsClientCtor),
  ...input
});
const ENV_KEY = "AWS_ACCESS_KEY_ID";
const ENV_SECRET = "AWS_SECRET_ACCESS_KEY";
const ENV_SESSION = "AWS_SESSION_TOKEN";
const ENV_EXPIRATION = "AWS_CREDENTIAL_EXPIRATION";
const fromEnv$1 = () => async () => {
  const accessKeyId = process.env[ENV_KEY];
  const secretAccessKey = process.env[ENV_SECRET];
  const sessionToken = process.env[ENV_SESSION];
  const expiry = process.env[ENV_EXPIRATION];
  if (accessKeyId && secretAccessKey) {
    return {
      accessKeyId,
      secretAccessKey,
      ...sessionToken && { sessionToken },
      ...expiry && { expiration: new Date(expiry) }
    };
  }
  throw new CredentialsProviderError("Unable to find environment variable credentials.");
};
const getHomeDir = () => {
  const { HOME, USERPROFILE, HOMEPATH, HOMEDRIVE = `C:${sep}` } = process.env;
  if (HOME)
    return HOME;
  if (USERPROFILE)
    return USERPROFILE;
  if (HOMEPATH)
    return `${HOMEDRIVE}${HOMEPATH}`;
  return homedir();
};
const ENV_PROFILE = "AWS_PROFILE";
const DEFAULT_PROFILE = "default";
const getProfileName = (init) => init.profile || process.env[ENV_PROFILE] || DEFAULT_PROFILE;
const getSSOTokenFilepath = (id) => {
  const hasher = createHash("sha1");
  const cacheName = hasher.update(id).digest("hex");
  return join(getHomeDir(), ".aws", "sso", "cache", `${cacheName}.json`);
};
const { readFile: readFile$1 } = promises;
const getSSOTokenFromFile = async (id) => {
  const ssoTokenFilepath = getSSOTokenFilepath(id);
  const ssoTokenText = await readFile$1(ssoTokenFilepath, "utf8");
  return JSON.parse(ssoTokenText);
};
const ENV_CONFIG_PATH = "AWS_CONFIG_FILE";
const getConfigFilepath = () => process.env[ENV_CONFIG_PATH] || join(getHomeDir(), ".aws", "config");
const ENV_CREDENTIALS_PATH = "AWS_SHARED_CREDENTIALS_FILE";
const getCredentialsFilepath = () => process.env[ENV_CREDENTIALS_PATH] || join(getHomeDir(), ".aws", "credentials");
const profileKeyRegex = /^profile\s(["'])?([^\1]+)\1$/;
const getProfileData = (data) => Object.entries(data).filter(([key]) => profileKeyRegex.test(key)).reduce((acc, [key, value]) => ({ ...acc, [profileKeyRegex.exec(key)[2]]: value }), {
  ...data.default && { default: data.default }
});
const profileNameBlockList = ["__proto__", "profile __proto__"];
const parseIni = (iniData) => {
  const map2 = {};
  let currentSection;
  for (let line of iniData.split(/\r?\n/)) {
    line = line.split(/(^|\s)[;#]/)[0].trim();
    const isSection = line[0] === "[" && line[line.length - 1] === "]";
    if (isSection) {
      currentSection = line.substring(1, line.length - 1);
      if (profileNameBlockList.includes(currentSection)) {
        throw new Error(`Found invalid profile name "${currentSection}"`);
      }
    } else if (currentSection) {
      const indexOfEqualsSign = line.indexOf("=");
      const start = 0;
      const end = line.length - 1;
      const isAssignment = indexOfEqualsSign !== -1 && indexOfEqualsSign !== start && indexOfEqualsSign !== end;
      if (isAssignment) {
        const [name2, value] = [
          line.substring(0, indexOfEqualsSign).trim(),
          line.substring(indexOfEqualsSign + 1).trim()
        ];
        map2[currentSection] = map2[currentSection] || {};
        map2[currentSection][name2] = value;
      }
    }
  }
  return map2;
};
const { readFile } = promises;
const filePromisesHash = {};
const slurpFile = (path) => {
  if (!filePromisesHash[path]) {
    filePromisesHash[path] = readFile(path, "utf8");
  }
  return filePromisesHash[path];
};
const swallowError$1 = () => ({});
const loadSharedConfigFiles = async (init = {}) => {
  const { filepath = getCredentialsFilepath(), configFilepath = getConfigFilepath() } = init;
  const parsedFiles = await Promise.all([
    slurpFile(configFilepath).then(parseIni).then(getProfileData).catch(swallowError$1),
    slurpFile(filepath).then(parseIni).catch(swallowError$1)
  ]);
  return {
    configFile: parsedFiles[0],
    credentialsFile: parsedFiles[1]
  };
};
const ssoSessionKeyRegex = /^sso-session\s(["'])?([^\1]+)\1$/;
const getSsoSessionData = (data) => Object.entries(data).filter(([key]) => ssoSessionKeyRegex.test(key)).reduce((acc, [key, value]) => ({ ...acc, [ssoSessionKeyRegex.exec(key)[2]]: value }), {});
const swallowError = () => ({});
const loadSsoSessionData = async (init = {}) => slurpFile(init.configFilepath ?? getConfigFilepath()).then(parseIni).then(getSsoSessionData).catch(swallowError);
const parseKnownFiles = async (init) => {
  const parsedFiles = await loadSharedConfigFiles(init);
  return {
    ...parsedFiles.configFile,
    ...parsedFiles.credentialsFile
  };
};
function httpRequest(options) {
  return new Promise((resolve, reject) => {
    const req = request({
      method: "GET",
      ...options,
      hostname: options.hostname?.replace(/^\[(.+)\]$/, "$1")
    });
    req.on("error", (err) => {
      reject(Object.assign(new ProviderError("Unable to connect to instance metadata service"), err));
      req.destroy();
    });
    req.on("timeout", () => {
      reject(new ProviderError("TimeoutError from instance metadata service"));
      req.destroy();
    });
    req.on("response", (res) => {
      const { statusCode = 400 } = res;
      if (statusCode < 200 || 300 <= statusCode) {
        reject(Object.assign(new ProviderError("Error response received from instance metadata service"), { statusCode }));
        req.destroy();
      }
      const chunks = [];
      res.on("data", (chunk) => {
        chunks.push(chunk);
      });
      res.on("end", () => {
        resolve(Buffer$1.concat(chunks));
        req.destroy();
      });
    });
    req.end();
  });
}
const isImdsCredentials = (arg) => Boolean(arg) && typeof arg === "object" && typeof arg.AccessKeyId === "string" && typeof arg.SecretAccessKey === "string" && typeof arg.Token === "string" && typeof arg.Expiration === "string";
const fromImdsCredentials = (creds) => ({
  accessKeyId: creds.AccessKeyId,
  secretAccessKey: creds.SecretAccessKey,
  sessionToken: creds.Token,
  expiration: new Date(creds.Expiration)
});
const DEFAULT_TIMEOUT = 1e3;
const DEFAULT_MAX_RETRIES = 0;
const providerConfigFromInit = ({ maxRetries = DEFAULT_MAX_RETRIES, timeout = DEFAULT_TIMEOUT }) => ({ maxRetries, timeout });
const retry = (toRetry, maxRetries) => {
  let promise = toRetry();
  for (let i2 = 0; i2 < maxRetries; i2++) {
    promise = promise.catch(toRetry);
  }
  return promise;
};
const ENV_CMDS_FULL_URI = "AWS_CONTAINER_CREDENTIALS_FULL_URI";
const ENV_CMDS_RELATIVE_URI = "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI";
const ENV_CMDS_AUTH_TOKEN = "AWS_CONTAINER_AUTHORIZATION_TOKEN";
const fromContainerMetadata = (init = {}) => {
  const { timeout, maxRetries } = providerConfigFromInit(init);
  return () => retry(async () => {
    const requestOptions = await getCmdsUri();
    const credsResponse = JSON.parse(await requestFromEcsImds(timeout, requestOptions));
    if (!isImdsCredentials(credsResponse)) {
      throw new CredentialsProviderError("Invalid response received from instance metadata service.");
    }
    return fromImdsCredentials(credsResponse);
  }, maxRetries);
};
const requestFromEcsImds = async (timeout, options) => {
  if (process.env[ENV_CMDS_AUTH_TOKEN]) {
    options.headers = {
      ...options.headers,
      Authorization: process.env[ENV_CMDS_AUTH_TOKEN]
    };
  }
  const buffer = await httpRequest({
    ...options,
    timeout
  });
  return buffer.toString();
};
const CMDS_IP = "169.254.170.2";
const GREENGRASS_HOSTS = {
  localhost: true,
  "127.0.0.1": true
};
const GREENGRASS_PROTOCOLS = {
  "http:": true,
  "https:": true
};
const getCmdsUri = async () => {
  if (process.env[ENV_CMDS_RELATIVE_URI]) {
    return {
      hostname: CMDS_IP,
      path: process.env[ENV_CMDS_RELATIVE_URI]
    };
  }
  if (process.env[ENV_CMDS_FULL_URI]) {
    const parsed = parse(process.env[ENV_CMDS_FULL_URI]);
    if (!parsed.hostname || !(parsed.hostname in GREENGRASS_HOSTS)) {
      throw new CredentialsProviderError(`${parsed.hostname} is not a valid container metadata service hostname`, false);
    }
    if (!parsed.protocol || !(parsed.protocol in GREENGRASS_PROTOCOLS)) {
      throw new CredentialsProviderError(`${parsed.protocol} is not a valid container metadata service protocol`, false);
    }
    return {
      ...parsed,
      port: parsed.port ? parseInt(parsed.port, 10) : void 0
    };
  }
  throw new CredentialsProviderError(`The container metadata credential provider cannot be used unless the ${ENV_CMDS_RELATIVE_URI} or ${ENV_CMDS_FULL_URI} environment variable is set`, false);
};
const fromEnv = (envVarSelector) => async () => {
  try {
    const config = envVarSelector(process.env);
    if (config === void 0) {
      throw new Error();
    }
    return config;
  } catch (e2) {
    throw new CredentialsProviderError(e2.message || `Cannot load config from environment variables with getter: ${envVarSelector}`);
  }
};
const fromSharedConfigFiles = (configSelector, { preferredFile = "config", ...init } = {}) => async () => {
  const profile = getProfileName(init);
  const { configFile, credentialsFile } = await loadSharedConfigFiles(init);
  const profileFromCredentials = credentialsFile[profile] || {};
  const profileFromConfig = configFile[profile] || {};
  const mergedProfile = preferredFile === "config" ? { ...profileFromCredentials, ...profileFromConfig } : { ...profileFromConfig, ...profileFromCredentials };
  try {
    const configValue = configSelector(mergedProfile);
    if (configValue === void 0) {
      throw new Error();
    }
    return configValue;
  } catch (e2) {
    throw new CredentialsProviderError(e2.message || `Cannot load config for profile ${profile} in SDK configuration files with getter: ${configSelector}`);
  }
};
const isFunction = (func) => typeof func === "function";
const fromStatic = (defaultValue) => isFunction(defaultValue) ? async () => await defaultValue() : fromStatic$1(defaultValue);
const loadConfig = ({ environmentVariableSelector, configFileSelector, default: defaultValue }, configuration = {}) => memoize(chain(fromEnv(environmentVariableSelector), fromSharedConfigFiles(configFileSelector, configuration), fromStatic(defaultValue)));
var Endpoint;
(function(Endpoint2) {
  Endpoint2["IPv4"] = "http://169.254.169.254";
  Endpoint2["IPv6"] = "http://[fd00:ec2::254]";
})(Endpoint || (Endpoint = {}));
const ENV_ENDPOINT_NAME = "AWS_EC2_METADATA_SERVICE_ENDPOINT";
const CONFIG_ENDPOINT_NAME = "ec2_metadata_service_endpoint";
const ENDPOINT_CONFIG_OPTIONS = {
  environmentVariableSelector: (env2) => env2[ENV_ENDPOINT_NAME],
  configFileSelector: (profile) => profile[CONFIG_ENDPOINT_NAME],
  default: void 0
};
var EndpointMode;
(function(EndpointMode2) {
  EndpointMode2["IPv4"] = "IPv4";
  EndpointMode2["IPv6"] = "IPv6";
})(EndpointMode || (EndpointMode = {}));
const ENV_ENDPOINT_MODE_NAME = "AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE";
const CONFIG_ENDPOINT_MODE_NAME = "ec2_metadata_service_endpoint_mode";
const ENDPOINT_MODE_CONFIG_OPTIONS = {
  environmentVariableSelector: (env2) => env2[ENV_ENDPOINT_MODE_NAME],
  configFileSelector: (profile) => profile[CONFIG_ENDPOINT_MODE_NAME],
  default: EndpointMode.IPv4
};
const getInstanceMetadataEndpoint = async () => parseUrl(await getFromEndpointConfig() || await getFromEndpointModeConfig());
const getFromEndpointConfig = async () => loadConfig(ENDPOINT_CONFIG_OPTIONS)();
const getFromEndpointModeConfig = async () => {
  const endpointMode = await loadConfig(ENDPOINT_MODE_CONFIG_OPTIONS)();
  switch (endpointMode) {
    case EndpointMode.IPv4:
      return Endpoint.IPv4;
    case EndpointMode.IPv6:
      return Endpoint.IPv6;
    default:
      throw new Error(`Unsupported endpoint mode: ${endpointMode}. Select from ${Object.values(EndpointMode)}`);
  }
};
const STATIC_STABILITY_REFRESH_INTERVAL_SECONDS = 5 * 60;
const STATIC_STABILITY_REFRESH_INTERVAL_JITTER_WINDOW_SECONDS = 5 * 60;
const STATIC_STABILITY_DOC_URL = "https://docs.aws.amazon.com/sdkref/latest/guide/feature-static-credentials.html";
const getExtendedInstanceMetadataCredentials = (credentials, logger2) => {
  const refreshInterval = STATIC_STABILITY_REFRESH_INTERVAL_SECONDS + Math.floor(Math.random() * STATIC_STABILITY_REFRESH_INTERVAL_JITTER_WINDOW_SECONDS);
  const newExpiration = new Date(Date.now() + refreshInterval * 1e3);
  logger2.warn("Attempting credential expiration extension due to a credential service availability issue. A refresh of these credentials will be attempted after ${new Date(newExpiration)}.\nFor more information, please visit: " + STATIC_STABILITY_DOC_URL);
  const originalExpiration = credentials.originalExpiration ?? credentials.expiration;
  return {
    ...credentials,
    ...originalExpiration ? { originalExpiration } : {},
    expiration: newExpiration
  };
};
const staticStabilityProvider = (provider, options = {}) => {
  const logger2 = options?.logger || console;
  let pastCredentials;
  return async () => {
    let credentials;
    try {
      credentials = await provider();
      if (credentials.expiration && credentials.expiration.getTime() < Date.now()) {
        credentials = getExtendedInstanceMetadataCredentials(credentials, logger2);
      }
    } catch (e2) {
      if (pastCredentials) {
        logger2.warn("Credential renew failed: ", e2);
        credentials = getExtendedInstanceMetadataCredentials(pastCredentials, logger2);
      } else {
        throw e2;
      }
    }
    pastCredentials = credentials;
    return credentials;
  };
};
const IMDS_PATH = "/latest/meta-data/iam/security-credentials/";
const IMDS_TOKEN_PATH = "/latest/api/token";
const fromInstanceMetadata = (init = {}) => staticStabilityProvider(getInstanceImdsProvider(init), { logger: init.logger });
const getInstanceImdsProvider = (init) => {
  let disableFetchToken = false;
  const { timeout, maxRetries } = providerConfigFromInit(init);
  const getCredentials = async (maxRetries2, options) => {
    const profile = (await retry(async () => {
      let profile2;
      try {
        profile2 = await getProfile(options);
      } catch (err) {
        if (err.statusCode === 401) {
          disableFetchToken = false;
        }
        throw err;
      }
      return profile2;
    }, maxRetries2)).trim();
    return retry(async () => {
      let creds;
      try {
        creds = await getCredentialsFromProfile(profile, options);
      } catch (err) {
        if (err.statusCode === 401) {
          disableFetchToken = false;
        }
        throw err;
      }
      return creds;
    }, maxRetries2);
  };
  return async () => {
    const endpoint = await getInstanceMetadataEndpoint();
    if (disableFetchToken) {
      return getCredentials(maxRetries, { ...endpoint, timeout });
    } else {
      let token;
      try {
        token = (await getMetadataToken({ ...endpoint, timeout })).toString();
      } catch (error) {
        if (error?.statusCode === 400) {
          throw Object.assign(error, {
            message: "EC2 Metadata token request returned error"
          });
        } else if (error.message === "TimeoutError" || [403, 404, 405].includes(error.statusCode)) {
          disableFetchToken = true;
        }
        return getCredentials(maxRetries, { ...endpoint, timeout });
      }
      return getCredentials(maxRetries, {
        ...endpoint,
        headers: {
          "x-aws-ec2-metadata-token": token
        },
        timeout
      });
    }
  };
};
const getMetadataToken = async (options) => httpRequest({
  ...options,
  path: IMDS_TOKEN_PATH,
  method: "PUT",
  headers: {
    "x-aws-ec2-metadata-token-ttl-seconds": "21600"
  }
});
const getProfile = async (options) => (await httpRequest({ ...options, path: IMDS_PATH })).toString();
const getCredentialsFromProfile = async (profile, options) => {
  const credsResponse = JSON.parse((await httpRequest({
    ...options,
    path: IMDS_PATH + profile
  })).toString());
  if (!isImdsCredentials(credsResponse)) {
    throw new CredentialsProviderError("Invalid response received from instance metadata service.");
  }
  return fromImdsCredentials(credsResponse);
};
const resolveCredentialSource = (credentialSource, profileName) => {
  const sourceProvidersMap = {
    EcsContainer: fromContainerMetadata,
    Ec2InstanceMetadata: fromInstanceMetadata,
    Environment: fromEnv$1
  };
  if (credentialSource in sourceProvidersMap) {
    return sourceProvidersMap[credentialSource]();
  } else {
    throw new CredentialsProviderError(`Unsupported credential source in profile ${profileName}. Got ${credentialSource}, expected EcsContainer or Ec2InstanceMetadata or Environment.`);
  }
};
const isAssumeRoleProfile = (arg) => Boolean(arg) && typeof arg === "object" && typeof arg.role_arn === "string" && ["undefined", "string"].indexOf(typeof arg.role_session_name) > -1 && ["undefined", "string"].indexOf(typeof arg.external_id) > -1 && ["undefined", "string"].indexOf(typeof arg.mfa_serial) > -1 && (isAssumeRoleWithSourceProfile(arg) || isAssumeRoleWithProviderProfile(arg));
const isAssumeRoleWithSourceProfile = (arg) => typeof arg.source_profile === "string" && typeof arg.credential_source === "undefined";
const isAssumeRoleWithProviderProfile = (arg) => typeof arg.credential_source === "string" && typeof arg.source_profile === "undefined";
const resolveAssumeRoleCredentials = async (profileName, profiles, options, visitedProfiles = {}) => {
  const data = profiles[profileName];
  if (!options.roleAssumer) {
    throw new CredentialsProviderError(`Profile ${profileName} requires a role to be assumed, but no role assumption callback was provided.`, false);
  }
  const { source_profile } = data;
  if (source_profile && source_profile in visitedProfiles) {
    throw new CredentialsProviderError(`Detected a cycle attempting to resolve credentials for profile ${getProfileName(options)}. Profiles visited: ` + Object.keys(visitedProfiles).join(", "), false);
  }
  const sourceCredsProvider = source_profile ? resolveProfileData(source_profile, profiles, options, {
    ...visitedProfiles,
    [source_profile]: true
  }) : resolveCredentialSource(data.credential_source, profileName)();
  const params = {
    RoleArn: data.role_arn,
    RoleSessionName: data.role_session_name || `aws-sdk-js-${Date.now()}`,
    ExternalId: data.external_id
  };
  const { mfa_serial } = data;
  if (mfa_serial) {
    if (!options.mfaCodeProvider) {
      throw new CredentialsProviderError(`Profile ${profileName} requires multi-factor authentication, but no MFA code callback was provided.`, false);
    }
    params.SerialNumber = mfa_serial;
    params.TokenCode = await options.mfaCodeProvider(mfa_serial);
  }
  const sourceCreds = await sourceCredsProvider;
  return options.roleAssumer(sourceCreds, params);
};
const getValidatedProcessCredentials = (profileName, data) => {
  if (data.Version !== 1) {
    throw Error(`Profile ${profileName} credential_process did not return Version 1.`);
  }
  if (data.AccessKeyId === void 0 || data.SecretAccessKey === void 0) {
    throw Error(`Profile ${profileName} credential_process returned invalid credentials.`);
  }
  if (data.Expiration) {
    const currentTime = /* @__PURE__ */ new Date();
    const expireTime = new Date(data.Expiration);
    if (expireTime < currentTime) {
      throw Error(`Profile ${profileName} credential_process returned expired credentials.`);
    }
  }
  return {
    accessKeyId: data.AccessKeyId,
    secretAccessKey: data.SecretAccessKey,
    ...data.SessionToken && { sessionToken: data.SessionToken },
    ...data.Expiration && { expiration: new Date(data.Expiration) }
  };
};
const resolveProcessCredentials$1 = async (profileName, profiles) => {
  const profile = profiles[profileName];
  if (profiles[profileName]) {
    const credentialProcess = profile["credential_process"];
    if (credentialProcess !== void 0) {
      const execPromise = promisify(exec);
      try {
        const { stdout } = await execPromise(credentialProcess);
        let data;
        try {
          data = JSON.parse(stdout.trim());
        } catch {
          throw Error(`Profile ${profileName} credential_process returned invalid JSON.`);
        }
        return getValidatedProcessCredentials(profileName, data);
      } catch (error) {
        throw new CredentialsProviderError(error.message);
      }
    } else {
      throw new CredentialsProviderError(`Profile ${profileName} did not contain credential_process.`);
    }
  } else {
    throw new CredentialsProviderError(`Profile ${profileName} could not be found in shared credentials file.`);
  }
};
const fromProcess = (init = {}) => async () => {
  const profiles = await parseKnownFiles(init);
  return resolveProcessCredentials$1(getProfileName(init), profiles);
};
const isProcessProfile = (arg) => Boolean(arg) && typeof arg === "object" && typeof arg.credential_process === "string";
const resolveProcessCredentials = async (options, profile) => fromProcess({
  ...options,
  profile
})();
const isSsoProfile = (arg) => arg && (typeof arg.sso_start_url === "string" || typeof arg.sso_account_id === "string" || typeof arg.sso_session === "string" || typeof arg.sso_region === "string" || typeof arg.sso_role_name === "string");
class SSOServiceException extends ServiceException {
  constructor(options) {
    super(options);
    Object.setPrototypeOf(this, SSOServiceException.prototype);
  }
}
let InvalidRequestException$1 = class InvalidRequestException extends SSOServiceException {
  constructor(opts) {
    super({
      name: "InvalidRequestException",
      $fault: "client",
      ...opts
    });
    this.name = "InvalidRequestException";
    this.$fault = "client";
    Object.setPrototypeOf(this, InvalidRequestException.prototype);
  }
};
class ResourceNotFoundException extends SSOServiceException {
  constructor(opts) {
    super({
      name: "ResourceNotFoundException",
      $fault: "client",
      ...opts
    });
    this.name = "ResourceNotFoundException";
    this.$fault = "client";
    Object.setPrototypeOf(this, ResourceNotFoundException.prototype);
  }
}
class TooManyRequestsException extends SSOServiceException {
  constructor(opts) {
    super({
      name: "TooManyRequestsException",
      $fault: "client",
      ...opts
    });
    this.name = "TooManyRequestsException";
    this.$fault = "client";
    Object.setPrototypeOf(this, TooManyRequestsException.prototype);
  }
}
class UnauthorizedException extends SSOServiceException {
  constructor(opts) {
    super({
      name: "UnauthorizedException",
      $fault: "client",
      ...opts
    });
    this.name = "UnauthorizedException";
    this.$fault = "client";
    Object.setPrototypeOf(this, UnauthorizedException.prototype);
  }
}
const GetRoleCredentialsRequestFilterSensitiveLog = (obj) => ({
  ...obj,
  ...obj.accessToken && { accessToken: SENSITIVE_STRING }
});
const RoleCredentialsFilterSensitiveLog = (obj) => ({
  ...obj,
  ...obj.secretAccessKey && { secretAccessKey: SENSITIVE_STRING },
  ...obj.sessionToken && { sessionToken: SENSITIVE_STRING }
});
const GetRoleCredentialsResponseFilterSensitiveLog = (obj) => ({
  ...obj,
  ...obj.roleCredentials && { roleCredentials: RoleCredentialsFilterSensitiveLog(obj.roleCredentials) }
});
const serializeAws_restJson1GetRoleCredentialsCommand = async (input, context) => {
  const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
  const headers = map$1({}, isSerializableHeaderValue, {
    "x-amz-sso_bearer_token": input.accessToken
  });
  const resolvedPath = `${basePath?.endsWith("/") ? basePath.slice(0, -1) : basePath || ""}/federation/credentials`;
  const query = map$1({
    role_name: [, expectNonNull(input.roleName, `roleName`)],
    account_id: [, expectNonNull(input.accountId, `accountId`)]
  });
  let body;
  return new HttpRequest({
    protocol,
    hostname,
    port,
    method: "GET",
    headers,
    path: resolvedPath,
    query,
    body
  });
};
const deserializeAws_restJson1GetRoleCredentialsCommand = async (output, context) => {
  if (output.statusCode !== 200 && output.statusCode >= 300) {
    return deserializeAws_restJson1GetRoleCredentialsCommandError(output, context);
  }
  const contents = map$1({
    $metadata: deserializeMetadata$1(output)
  });
  const data = expectNonNull(expectObject(await parseBody$1(output.body, context)), "body");
  if (data.roleCredentials != null) {
    contents.roleCredentials = deserializeAws_restJson1RoleCredentials(data.roleCredentials);
  }
  return contents;
};
const deserializeAws_restJson1GetRoleCredentialsCommandError = async (output, context) => {
  const parsedOutput = {
    ...output,
    body: await parseErrorBody$1(output.body, context)
  };
  const errorCode = loadRestJsonErrorCode$1(output, parsedOutput.body);
  switch (errorCode) {
    case "InvalidRequestException":
    case "com.amazonaws.sso#InvalidRequestException":
      throw await deserializeAws_restJson1InvalidRequestExceptionResponse$1(parsedOutput);
    case "ResourceNotFoundException":
    case "com.amazonaws.sso#ResourceNotFoundException":
      throw await deserializeAws_restJson1ResourceNotFoundExceptionResponse(parsedOutput);
    case "TooManyRequestsException":
    case "com.amazonaws.sso#TooManyRequestsException":
      throw await deserializeAws_restJson1TooManyRequestsExceptionResponse(parsedOutput);
    case "UnauthorizedException":
    case "com.amazonaws.sso#UnauthorizedException":
      throw await deserializeAws_restJson1UnauthorizedExceptionResponse(parsedOutput);
    default:
      const parsedBody = parsedOutput.body;
      throwDefaultError({
        output,
        parsedBody,
        exceptionCtor: SSOServiceException,
        errorCode
      });
  }
};
const map$1 = map$2;
const deserializeAws_restJson1InvalidRequestExceptionResponse$1 = async (parsedOutput, context) => {
  const contents = map$1({});
  const data = parsedOutput.body;
  if (data.message != null) {
    contents.message = expectString(data.message);
  }
  const exception = new InvalidRequestException$1({
    $metadata: deserializeMetadata$1(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1ResourceNotFoundExceptionResponse = async (parsedOutput, context) => {
  const contents = map$1({});
  const data = parsedOutput.body;
  if (data.message != null) {
    contents.message = expectString(data.message);
  }
  const exception = new ResourceNotFoundException({
    $metadata: deserializeMetadata$1(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1TooManyRequestsExceptionResponse = async (parsedOutput, context) => {
  const contents = map$1({});
  const data = parsedOutput.body;
  if (data.message != null) {
    contents.message = expectString(data.message);
  }
  const exception = new TooManyRequestsException({
    $metadata: deserializeMetadata$1(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1UnauthorizedExceptionResponse = async (parsedOutput, context) => {
  const contents = map$1({});
  const data = parsedOutput.body;
  if (data.message != null) {
    contents.message = expectString(data.message);
  }
  const exception = new UnauthorizedException({
    $metadata: deserializeMetadata$1(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1RoleCredentials = (output, context) => {
  return {
    accessKeyId: expectString(output.accessKeyId),
    expiration: expectLong(output.expiration),
    secretAccessKey: expectString(output.secretAccessKey),
    sessionToken: expectString(output.sessionToken)
  };
};
const deserializeMetadata$1 = (output) => ({
  httpStatusCode: output.statusCode,
  requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
  extendedRequestId: output.headers["x-amz-id-2"],
  cfId: output.headers["x-amz-cf-id"]
});
const collectBody$1 = (streamBody = new Uint8Array(), context) => {
  if (streamBody instanceof Uint8Array) {
    return Promise.resolve(streamBody);
  }
  return context.streamCollector(streamBody) || Promise.resolve(new Uint8Array());
};
const collectBodyString$1 = (streamBody, context) => collectBody$1(streamBody, context).then((body) => context.utf8Encoder(body));
const isSerializableHeaderValue = (value) => value !== void 0 && value !== null && value !== "" && (!Object.getOwnPropertyNames(value).includes("length") || value.length != 0) && (!Object.getOwnPropertyNames(value).includes("size") || value.size != 0);
const parseBody$1 = (streamBody, context) => collectBodyString$1(streamBody, context).then((encoded) => {
  if (encoded.length) {
    return JSON.parse(encoded);
  }
  return {};
});
const parseErrorBody$1 = async (errorBody, context) => {
  const value = await parseBody$1(errorBody, context);
  value.message = value.message ?? value.Message;
  return value;
};
const loadRestJsonErrorCode$1 = (output, data) => {
  const findKey = (object, key) => Object.keys(object).find((k2) => k2.toLowerCase() === key.toLowerCase());
  const sanitizeErrorCode = (rawValue) => {
    let cleanValue = rawValue;
    if (typeof cleanValue === "number") {
      cleanValue = cleanValue.toString();
    }
    if (cleanValue.indexOf(",") >= 0) {
      cleanValue = cleanValue.split(",")[0];
    }
    if (cleanValue.indexOf(":") >= 0) {
      cleanValue = cleanValue.split(":")[0];
    }
    if (cleanValue.indexOf("#") >= 0) {
      cleanValue = cleanValue.split("#")[1];
    }
    return cleanValue;
  };
  const headerKey = findKey(output.headers, "x-amzn-errortype");
  if (headerKey !== void 0) {
    return sanitizeErrorCode(output.headers[headerKey]);
  }
  if (data.code !== void 0) {
    return sanitizeErrorCode(data.code);
  }
  if (data["__type"] !== void 0) {
    return sanitizeErrorCode(data["__type"]);
  }
};
class GetRoleCredentialsCommand extends Command {
  constructor(input) {
    super();
    this.input = input;
  }
  static getEndpointParameterInstructions() {
    return {
      UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
      Endpoint: { type: "builtInParams", name: "endpoint" },
      Region: { type: "builtInParams", name: "region" },
      UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" }
    };
  }
  resolveMiddleware(clientStack, configuration, options) {
    this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
    this.middlewareStack.use(getEndpointPlugin(configuration, GetRoleCredentialsCommand.getEndpointParameterInstructions()));
    const stack = clientStack.concat(this.middlewareStack);
    const { logger: logger2 } = configuration;
    const clientName = "SSOClient";
    const commandName = "GetRoleCredentialsCommand";
    const handlerExecutionContext = {
      logger: logger2,
      clientName,
      commandName,
      inputFilterSensitiveLog: GetRoleCredentialsRequestFilterSensitiveLog,
      outputFilterSensitiveLog: GetRoleCredentialsResponseFilterSensitiveLog
    };
    const { requestHandler } = configuration;
    return stack.resolve((request2) => requestHandler.handle(request2.request, options || {}), handlerExecutionContext);
  }
  serialize(input, context) {
    return serializeAws_restJson1GetRoleCredentialsCommand(input, context);
  }
  deserialize(output, context) {
    return deserializeAws_restJson1GetRoleCredentialsCommand(output, context);
  }
}
const resolveClientEndpointParameters$1 = (options) => {
  return {
    ...options,
    useDualstackEndpoint: options.useDualstackEndpoint ?? false,
    useFipsEndpoint: options.useFipsEndpoint ?? false,
    defaultSigningName: "awsssoportal"
  };
};
const name$1 = "@aws-sdk/client-sso";
const description$1 = "AWS SDK for JavaScript Sso Client for Node.js, Browser and React Native";
const version$2 = "3.279.0";
const scripts$1 = {
  build: "concurrently 'yarn:build:cjs' 'yarn:build:es' 'yarn:build:types'",
  "build:cjs": "tsc -p tsconfig.cjs.json",
  "build:docs": "typedoc",
  "build:es": "tsc -p tsconfig.es.json",
  "build:include:deps": "lerna run --scope $npm_package_name --include-dependencies build",
  "build:types": "tsc -p tsconfig.types.json",
  "build:types:downlevel": "downlevel-dts dist-types dist-types/ts3.4",
  clean: "rimraf ./dist-* && rimraf *.tsbuildinfo",
  "generate:client": "node ../../scripts/generate-clients/single-service --solo sso"
};
const main$1 = "./dist-cjs/index.js";
const types$1 = "./dist-types/index.d.ts";
const module$2 = "./dist-es/index.js";
const sideEffects$1 = false;
const dependencies$1 = {
  "@aws-crypto/sha256-browser": "3.0.0",
  "@aws-crypto/sha256-js": "3.0.0",
  "@aws-sdk/config-resolver": "3.272.0",
  "@aws-sdk/fetch-http-handler": "3.272.0",
  "@aws-sdk/hash-node": "3.272.0",
  "@aws-sdk/invalid-dependency": "3.272.0",
  "@aws-sdk/middleware-content-length": "3.272.0",
  "@aws-sdk/middleware-endpoint": "3.272.0",
  "@aws-sdk/middleware-host-header": "3.278.0",
  "@aws-sdk/middleware-logger": "3.272.0",
  "@aws-sdk/middleware-recursion-detection": "3.272.0",
  "@aws-sdk/middleware-retry": "3.272.0",
  "@aws-sdk/middleware-serde": "3.272.0",
  "@aws-sdk/middleware-stack": "3.272.0",
  "@aws-sdk/middleware-user-agent": "3.272.0",
  "@aws-sdk/node-config-provider": "3.272.0",
  "@aws-sdk/node-http-handler": "3.272.0",
  "@aws-sdk/protocol-http": "3.272.0",
  "@aws-sdk/smithy-client": "3.279.0",
  "@aws-sdk/types": "3.272.0",
  "@aws-sdk/url-parser": "3.272.0",
  "@aws-sdk/util-base64": "3.208.0",
  "@aws-sdk/util-body-length-browser": "3.188.0",
  "@aws-sdk/util-body-length-node": "3.208.0",
  "@aws-sdk/util-defaults-mode-browser": "3.279.0",
  "@aws-sdk/util-defaults-mode-node": "3.279.0",
  "@aws-sdk/util-endpoints": "3.272.0",
  "@aws-sdk/util-retry": "3.272.0",
  "@aws-sdk/util-user-agent-browser": "3.272.0",
  "@aws-sdk/util-user-agent-node": "3.272.0",
  "@aws-sdk/util-utf8": "3.254.0",
  tslib: "^2.3.1"
};
const devDependencies$1 = {
  "@aws-sdk/service-client-documentation-generator": "3.208.0",
  "@tsconfig/node14": "1.0.3",
  "@types/node": "^14.14.31",
  concurrently: "7.0.0",
  "downlevel-dts": "0.10.1",
  rimraf: "3.0.2",
  typedoc: "0.19.2",
  typescript: "~4.6.2"
};
const overrides$1 = {
  typedoc: {
    typescript: "~4.6.2"
  }
};
const engines$1 = {
  node: ">=14.0.0"
};
const typesVersions$1 = {
  "<4.0": {
    "dist-types/*": [
      "dist-types/ts3.4/*"
    ]
  }
};
const files$1 = [
  "dist-*"
];
const author$1 = {
  name: "AWS SDK for JavaScript Team",
  url: "https://aws.amazon.com/javascript/"
};
const license$1 = "Apache-2.0";
const browser$1 = {
  "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.browser"
};
const homepage$1 = "https://github.com/aws/aws-sdk-js-v3/tree/main/clients/client-sso";
const repository$1 = {
  type: "git",
  url: "https://github.com/aws/aws-sdk-js-v3.git",
  directory: "clients/client-sso"
};
const packageInfo$1 = {
  name: name$1,
  description: description$1,
  version: version$2,
  scripts: scripts$1,
  main: main$1,
  types: types$1,
  module: module$2,
  sideEffects: sideEffects$1,
  dependencies: dependencies$1,
  devDependencies: devDependencies$1,
  overrides: overrides$1,
  engines: engines$1,
  typesVersions: typesVersions$1,
  files: files$1,
  author: author$1,
  license: license$1,
  browser: browser$1,
  "react-native": {
    "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.native"
  },
  homepage: homepage$1,
  repository: repository$1
};
class Hash {
  constructor(algorithmIdentifier, secret) {
    this.algorithmIdentifier = algorithmIdentifier;
    this.secret = secret;
    this.reset();
  }
  update(toHash, encoding) {
    this.hash.update(toUint8Array(castSourceData(toHash, encoding)));
  }
  digest() {
    return Promise.resolve(this.hash.digest());
  }
  reset() {
    this.hash = this.secret ? createHmac(this.algorithmIdentifier, castSourceData(this.secret)) : createHash(this.algorithmIdentifier);
  }
}
function castSourceData(toCast, encoding) {
  if (Buffer$1.isBuffer(toCast)) {
    return toCast;
  }
  if (typeof toCast === "string") {
    return fromString(toCast, encoding);
  }
  if (ArrayBuffer.isView(toCast)) {
    return fromArrayBuffer(toCast.buffer, toCast.byteOffset, toCast.byteLength);
  }
  return fromArrayBuffer(toCast);
}
function buildQueryString(query) {
  const parts = [];
  for (let key of Object.keys(query).sort()) {
    const value = query[key];
    key = escapeUri(key);
    if (Array.isArray(value)) {
      for (let i2 = 0, iLen = value.length; i2 < iLen; i2++) {
        parts.push(`${key}=${escapeUri(value[i2])}`);
      }
    } else {
      let qsEntry = key;
      if (value || typeof value === "string") {
        qsEntry += `=${escapeUri(value)}`;
      }
      parts.push(qsEntry);
    }
  }
  return parts.join("&");
}
const NODEJS_TIMEOUT_ERROR_CODES = ["ECONNRESET", "EPIPE", "ETIMEDOUT"];
const getTransformedHeaders = (headers) => {
  const transformedHeaders = {};
  for (const name2 of Object.keys(headers)) {
    const headerValues = headers[name2];
    transformedHeaders[name2] = Array.isArray(headerValues) ? headerValues.join(",") : headerValues;
  }
  return transformedHeaders;
};
const setConnectionTimeout = (request2, reject, timeoutInMs = 0) => {
  if (!timeoutInMs) {
    return;
  }
  request2.on("socket", (socket) => {
    if (socket.connecting) {
      const timeoutId = setTimeout(() => {
        request2.destroy();
        reject(Object.assign(new Error(`Socket timed out without establishing a connection within ${timeoutInMs} ms`), {
          name: "TimeoutError"
        }));
      }, timeoutInMs);
      socket.on("connect", () => {
        clearTimeout(timeoutId);
      });
    }
  });
};
const setSocketTimeout = (request2, reject, timeoutInMs = 0) => {
  request2.setTimeout(timeoutInMs, () => {
    request2.destroy();
    reject(Object.assign(new Error(`Connection timed out after ${timeoutInMs} ms`), { name: "TimeoutError" }));
  });
};
function writeRequestBody(httpRequest2, request2) {
  const expect = request2.headers["Expect"] || request2.headers["expect"];
  if (expect === "100-continue") {
    httpRequest2.on("continue", () => {
      writeBody(httpRequest2, request2.body);
    });
  } else {
    writeBody(httpRequest2, request2.body);
  }
}
function writeBody(httpRequest2, body) {
  if (body instanceof Readable) {
    body.pipe(httpRequest2);
  } else if (body) {
    httpRequest2.end(Buffer.from(body));
  } else {
    httpRequest2.end();
  }
}
class NodeHttpHandler {
  constructor(options) {
    this.metadata = { handlerProtocol: "http/1.1" };
    this.configProvider = new Promise((resolve, reject) => {
      if (typeof options === "function") {
        options().then((_options) => {
          resolve(this.resolveDefaultConfig(_options));
        }).catch(reject);
      } else {
        resolve(this.resolveDefaultConfig(options));
      }
    });
  }
  resolveDefaultConfig(options) {
    const { connectionTimeout, socketTimeout, httpAgent, httpsAgent } = options || {};
    const keepAlive = true;
    const maxSockets = 50;
    return {
      connectionTimeout,
      socketTimeout,
      httpAgent: httpAgent || new Agent({ keepAlive, maxSockets }),
      httpsAgent: httpsAgent || new Agent$1({ keepAlive, maxSockets })
    };
  }
  destroy() {
    this.config?.httpAgent?.destroy();
    this.config?.httpsAgent?.destroy();
  }
  async handle(request$2, { abortSignal } = {}) {
    if (!this.config) {
      this.config = await this.configProvider;
    }
    return new Promise((resolve, reject) => {
      if (!this.config) {
        throw new Error("Node HTTP request handler config is not resolved");
      }
      if (abortSignal?.aborted) {
        const abortError = new Error("Request aborted");
        abortError.name = "AbortError";
        reject(abortError);
        return;
      }
      const isSSL = request$2.protocol === "https:";
      const queryString = buildQueryString(request$2.query || {});
      const nodeHttpsOptions = {
        headers: request$2.headers,
        host: request$2.hostname,
        method: request$2.method,
        path: queryString ? `${request$2.path}?${queryString}` : request$2.path,
        port: request$2.port,
        agent: isSSL ? this.config.httpsAgent : this.config.httpAgent
      };
      const requestFunc = isSSL ? request$1 : request;
      const req = requestFunc(nodeHttpsOptions, (res) => {
        const httpResponse = new HttpResponse({
          statusCode: res.statusCode || -1,
          headers: getTransformedHeaders(res.headers),
          body: res
        });
        resolve({ response: httpResponse });
      });
      req.on("error", (err) => {
        if (NODEJS_TIMEOUT_ERROR_CODES.includes(err.code)) {
          reject(Object.assign(err, { name: "TimeoutError" }));
        } else {
          reject(err);
        }
      });
      setConnectionTimeout(req, reject, this.config.connectionTimeout);
      setSocketTimeout(req, reject, this.config.socketTimeout);
      if (abortSignal) {
        abortSignal.onabort = () => {
          req.abort();
          const abortError = new Error("Request aborted");
          abortError.name = "AbortError";
          reject(abortError);
        };
      }
      writeRequestBody(req, request$2);
    });
  }
}
class Collector extends Writable {
  constructor() {
    super(...arguments);
    this.bufferedBytes = [];
  }
  _write(chunk, encoding, callback) {
    this.bufferedBytes.push(chunk);
    callback();
  }
}
const streamCollector = (stream) => new Promise((resolve, reject) => {
  const collector = new Collector();
  stream.pipe(collector);
  stream.on("error", (err) => {
    collector.end();
    reject(err);
  });
  collector.on("error", reject);
  collector.on("finish", function() {
    const bytes = new Uint8Array(Buffer.concat(this.bufferedBytes));
    resolve(bytes);
  });
});
const calculateBodyLength = (body) => {
  if (!body) {
    return 0;
  }
  if (typeof body === "string") {
    return Buffer.from(body).length;
  } else if (typeof body.byteLength === "number") {
    return body.byteLength;
  } else if (typeof body.size === "number") {
    return body.size;
  } else if (typeof body.path === "string" || Buffer.isBuffer(body.path)) {
    return lstatSync(body.path).size;
  } else if (typeof body.fd === "number") {
    return fstatSync(body.fd).size;
  }
  throw new Error(`Body Length computation failed for ${body}`);
};
const isCrtAvailable = () => {
  try {
    if (typeof require === "function" && typeof module !== "undefined" && module.require && require("aws-crt")) {
      return ["md/crt-avail"];
    }
    return null;
  } catch (e2) {
    return null;
  }
};
const UA_APP_ID_ENV_NAME = "AWS_SDK_UA_APP_ID";
const UA_APP_ID_INI_NAME = "sdk-ua-app-id";
const defaultUserAgent = ({ serviceId, clientVersion }) => {
  const sections = [
    ["aws-sdk-js", clientVersion],
    [`os/${platform()}`, release()],
    ["lang/js"],
    ["md/nodejs", `${versions.node}`]
  ];
  const crtAvailable = isCrtAvailable();
  if (crtAvailable) {
    sections.push(crtAvailable);
  }
  if (serviceId) {
    sections.push([`api/${serviceId}`, clientVersion]);
  }
  if (env.AWS_EXECUTION_ENV) {
    sections.push([`exec-env/${env.AWS_EXECUTION_ENV}`]);
  }
  const appIdPromise = loadConfig({
    environmentVariableSelector: (env2) => env2[UA_APP_ID_ENV_NAME],
    configFileSelector: (profile) => profile[UA_APP_ID_INI_NAME],
    default: void 0
  })();
  let resolvedUserAgent = void 0;
  return async () => {
    if (!resolvedUserAgent) {
      const appId = await appIdPromise;
      resolvedUserAgent = appId ? [...sections, [`app/${appId}`]] : [...sections];
    }
    return resolvedUserAgent;
  };
};
const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;
const fromBase64 = (input) => {
  if (input.length * 3 % 4 !== 0) {
    throw new TypeError(`Incorrect padding on base64 string.`);
  }
  if (!BASE64_REGEX.exec(input)) {
    throw new TypeError(`Invalid base64 string.`);
  }
  const buffer = fromString(input, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};
const toBase64 = (input) => fromArrayBuffer(input.buffer, input.byteOffset, input.byteLength).toString("base64");
const partitions$1 = [
  {
    id: "aws",
    outputs: {
      dnsSuffix: "amazonaws.com",
      dualStackDnsSuffix: "api.aws",
      name: "aws",
      supportsDualStack: true,
      supportsFIPS: true
    },
    regionRegex: "^(us|eu|ap|sa|ca|me|af)\\-\\w+\\-\\d+$",
    regions: {
      "af-south-1": {
        description: "Africa (Cape Town)"
      },
      "ap-east-1": {
        description: "Asia Pacific (Hong Kong)"
      },
      "ap-northeast-1": {
        description: "Asia Pacific (Tokyo)"
      },
      "ap-northeast-2": {
        description: "Asia Pacific (Seoul)"
      },
      "ap-northeast-3": {
        description: "Asia Pacific (Osaka)"
      },
      "ap-south-1": {
        description: "Asia Pacific (Mumbai)"
      },
      "ap-south-2": {
        description: "Asia Pacific (Hyderabad)"
      },
      "ap-southeast-1": {
        description: "Asia Pacific (Singapore)"
      },
      "ap-southeast-2": {
        description: "Asia Pacific (Sydney)"
      },
      "ap-southeast-3": {
        description: "Asia Pacific (Jakarta)"
      },
      "ap-southeast-4": {
        description: "Asia Pacific (Melbourne)"
      },
      "aws-global": {
        description: "AWS Standard global region"
      },
      "ca-central-1": {
        description: "Canada (Central)"
      },
      "eu-central-1": {
        description: "Europe (Frankfurt)"
      },
      "eu-central-2": {
        description: "Europe (Zurich)"
      },
      "eu-north-1": {
        description: "Europe (Stockholm)"
      },
      "eu-south-1": {
        description: "Europe (Milan)"
      },
      "eu-south-2": {
        description: "Europe (Spain)"
      },
      "eu-west-1": {
        description: "Europe (Ireland)"
      },
      "eu-west-2": {
        description: "Europe (London)"
      },
      "eu-west-3": {
        description: "Europe (Paris)"
      },
      "me-central-1": {
        description: "Middle East (UAE)"
      },
      "me-south-1": {
        description: "Middle East (Bahrain)"
      },
      "sa-east-1": {
        description: "South America (Sao Paulo)"
      },
      "us-east-1": {
        description: "US East (N. Virginia)"
      },
      "us-east-2": {
        description: "US East (Ohio)"
      },
      "us-west-1": {
        description: "US West (N. California)"
      },
      "us-west-2": {
        description: "US West (Oregon)"
      }
    }
  },
  {
    id: "aws-cn",
    outputs: {
      dnsSuffix: "amazonaws.com.cn",
      dualStackDnsSuffix: "api.amazonwebservices.com.cn",
      name: "aws-cn",
      supportsDualStack: true,
      supportsFIPS: true
    },
    regionRegex: "^cn\\-\\w+\\-\\d+$",
    regions: {
      "aws-cn-global": {
        description: "AWS China global region"
      },
      "cn-north-1": {
        description: "China (Beijing)"
      },
      "cn-northwest-1": {
        description: "China (Ningxia)"
      }
    }
  },
  {
    id: "aws-us-gov",
    outputs: {
      dnsSuffix: "amazonaws.com",
      dualStackDnsSuffix: "api.aws",
      name: "aws-us-gov",
      supportsDualStack: true,
      supportsFIPS: true
    },
    regionRegex: "^us\\-gov\\-\\w+\\-\\d+$",
    regions: {
      "aws-us-gov-global": {
        description: "AWS GovCloud (US) global region"
      },
      "us-gov-east-1": {
        description: "AWS GovCloud (US-East)"
      },
      "us-gov-west-1": {
        description: "AWS GovCloud (US-West)"
      }
    }
  },
  {
    id: "aws-iso",
    outputs: {
      dnsSuffix: "c2s.ic.gov",
      dualStackDnsSuffix: "c2s.ic.gov",
      name: "aws-iso",
      supportsDualStack: false,
      supportsFIPS: true
    },
    regionRegex: "^us\\-iso\\-\\w+\\-\\d+$",
    regions: {
      "aws-iso-global": {
        description: "AWS ISO (US) global region"
      },
      "us-iso-east-1": {
        description: "US ISO East"
      },
      "us-iso-west-1": {
        description: "US ISO WEST"
      }
    }
  },
  {
    id: "aws-iso-b",
    outputs: {
      dnsSuffix: "sc2s.sgov.gov",
      dualStackDnsSuffix: "sc2s.sgov.gov",
      name: "aws-iso-b",
      supportsDualStack: false,
      supportsFIPS: true
    },
    regionRegex: "^us\\-isob\\-\\w+\\-\\d+$",
    regions: {
      "aws-iso-b-global": {
        description: "AWS ISOB (US) global region"
      },
      "us-isob-east-1": {
        description: "US ISOB East (Ohio)"
      }
    }
  }
];
const version$1 = "1.1";
const partitionsInfo = {
  partitions: partitions$1,
  version: version$1
};
const { partitions } = partitionsInfo;
const DEFAULT_PARTITION = partitions.find((partition2) => partition2.id === "aws");
const partition = (value) => {
  for (const partition2 of partitions) {
    const { regions, outputs } = partition2;
    for (const [region, regionData] of Object.entries(regions)) {
      if (region === value) {
        return {
          ...outputs,
          ...regionData
        };
      }
    }
  }
  for (const partition2 of partitions) {
    const { regionRegex, outputs } = partition2;
    if (new RegExp(regionRegex).test(value)) {
      return {
        ...outputs
      };
    }
  }
  if (!DEFAULT_PARTITION) {
    throw new Error("Provided region was not found in the partition array or regex, and default partition with id 'aws' doesn't exist.");
  }
  return {
    ...DEFAULT_PARTITION.outputs
  };
};
const debugId = "endpoints";
function toDebugString(input) {
  if (typeof input !== "object" || input == null) {
    return input;
  }
  if ("ref" in input) {
    return `$${toDebugString(input.ref)}`;
  }
  if ("fn" in input) {
    return `${input.fn}(${(input.argv || []).map(toDebugString).join(", ")})`;
  }
  return JSON.stringify(input, null, 2);
}
class EndpointError extends Error {
  constructor(message) {
    super(message);
    this.name = "EndpointError";
  }
}
const IP_V4_REGEX = new RegExp(`^(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}$`);
const isIpAddress = (value) => IP_V4_REGEX.test(value) || value.startsWith("[") && value.endsWith("]");
const VALID_HOST_LABEL_REGEX = new RegExp(`^(?!.*-$)(?!-)[a-zA-Z0-9-]{1,63}$`);
const isValidHostLabel = (value, allowSubDomains = false) => {
  if (!allowSubDomains) {
    return VALID_HOST_LABEL_REGEX.test(value);
  }
  const labels = value.split(".");
  for (const label of labels) {
    if (!isValidHostLabel(label)) {
      return false;
    }
  }
  return true;
};
const isVirtualHostableS3Bucket = (value, allowSubDomains = false) => {
  if (allowSubDomains) {
    for (const label of value.split(".")) {
      if (!isVirtualHostableS3Bucket(label)) {
        return false;
      }
    }
    return true;
  }
  if (!isValidHostLabel(value)) {
    return false;
  }
  if (value.length < 3 || value.length > 63) {
    return false;
  }
  if (value !== value.toLowerCase()) {
    return false;
  }
  if (isIpAddress(value)) {
    return false;
  }
  return true;
};
const parseArn = (value) => {
  const segments = value.split(":");
  if (segments.length < 6)
    return null;
  const [arn, partition2, service, region, accountId, ...resourceId] = segments;
  if (arn !== "arn" || partition2 === "" || service === "" || resourceId[0] === "")
    return null;
  return {
    partition: partition2,
    service,
    region,
    accountId,
    resourceId: resourceId[0].includes("/") ? resourceId[0].split("/") : resourceId
  };
};
const index = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  isVirtualHostableS3Bucket,
  parseArn,
  partition
}, Symbol.toStringTag, { value: "Module" }));
const booleanEquals = (value1, value2) => value1 === value2;
const getAttrPathList = (path) => {
  const parts = path.split(".");
  const pathList = [];
  for (const part of parts) {
    const squareBracketIndex = part.indexOf("[");
    if (squareBracketIndex !== -1) {
      if (part.indexOf("]") !== part.length - 1) {
        throw new EndpointError(`Path: '${path}' does not end with ']'`);
      }
      const arrayIndex = part.slice(squareBracketIndex + 1, -1);
      if (Number.isNaN(parseInt(arrayIndex))) {
        throw new EndpointError(`Invalid array index: '${arrayIndex}' in path: '${path}'`);
      }
      if (squareBracketIndex !== 0) {
        pathList.push(part.slice(0, squareBracketIndex));
      }
      pathList.push(arrayIndex);
    } else {
      pathList.push(part);
    }
  }
  return pathList;
};
const getAttr = (value, path) => getAttrPathList(path).reduce((acc, index2) => {
  if (typeof acc !== "object") {
    throw new EndpointError(`Index '${index2}' in '${path}' not found in '${JSON.stringify(value)}'`);
  } else if (Array.isArray(acc)) {
    return acc[parseInt(index2)];
  }
  return acc[index2];
}, value);
const isSet = (value) => value != null;
const not = (value) => !value;
var HttpAuthLocation;
(function(HttpAuthLocation2) {
  HttpAuthLocation2["HEADER"] = "header";
  HttpAuthLocation2["QUERY"] = "query";
})(HttpAuthLocation || (HttpAuthLocation = {}));
var HostAddressType;
(function(HostAddressType2) {
  HostAddressType2["AAAA"] = "AAAA";
  HostAddressType2["A"] = "A";
})(HostAddressType || (HostAddressType = {}));
var EndpointURLScheme;
(function(EndpointURLScheme2) {
  EndpointURLScheme2["HTTP"] = "http";
  EndpointURLScheme2["HTTPS"] = "https";
})(EndpointURLScheme || (EndpointURLScheme = {}));
const DEFAULT_PORTS = {
  [EndpointURLScheme.HTTP]: 80,
  [EndpointURLScheme.HTTPS]: 443
};
const parseURL = (value) => {
  const whatwgURL = (() => {
    try {
      if (value instanceof URL) {
        return value;
      }
      if (typeof value === "object" && "hostname" in value) {
        const { hostname: hostname2, port, protocol: protocol2 = "", path = "", query = {} } = value;
        const url = new URL(`${protocol2}//${hostname2}${port ? `:${port}` : ""}${path}`);
        url.search = Object.entries(query).map(([k2, v2]) => `${k2}=${v2}`).join("&");
        return url;
      }
      return new URL(value);
    } catch (error) {
      return null;
    }
  })();
  if (!whatwgURL) {
    console.error(`Unable to parse ${JSON.stringify(value)} as a whatwg URL.`);
    return null;
  }
  const urlString = whatwgURL.href;
  const { host, hostname, pathname, protocol, search } = whatwgURL;
  if (search) {
    return null;
  }
  const scheme = protocol.slice(0, -1);
  if (!Object.values(EndpointURLScheme).includes(scheme)) {
    return null;
  }
  const isIp = isIpAddress(hostname);
  const inputContainsDefaultPort = urlString.includes(`${host}:${DEFAULT_PORTS[scheme]}`) || typeof value === "string" && value.includes(`${host}:${DEFAULT_PORTS[scheme]}`);
  const authority = `${host}${inputContainsDefaultPort ? `:${DEFAULT_PORTS[scheme]}` : ``}`;
  return {
    scheme,
    authority,
    path: pathname,
    normalizedPath: pathname.endsWith("/") ? pathname : `${pathname}/`,
    isIp
  };
};
const stringEquals = (value1, value2) => value1 === value2;
const substring = (input, start, stop, reverse) => {
  if (start >= stop || input.length < stop) {
    return null;
  }
  if (!reverse) {
    return input.substring(start, stop);
  }
  return input.substring(input.length - stop, input.length - start);
};
const uriEncode = (value) => encodeURIComponent(value).replace(/[!*'()]/g, (c2) => `%${c2.charCodeAt(0).toString(16).toUpperCase()}`);
const lib = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  aws: index,
  booleanEquals,
  getAttr,
  isSet,
  isValidHostLabel,
  not,
  parseURL,
  stringEquals,
  substring,
  uriEncode
}, Symbol.toStringTag, { value: "Module" }));
const evaluateTemplate = (template, options) => {
  const evaluatedTemplateArr = [];
  const templateContext = {
    ...options.endpointParams,
    ...options.referenceRecord
  };
  let currentIndex = 0;
  while (currentIndex < template.length) {
    const openingBraceIndex = template.indexOf("{", currentIndex);
    if (openingBraceIndex === -1) {
      evaluatedTemplateArr.push(template.slice(currentIndex));
      break;
    }
    evaluatedTemplateArr.push(template.slice(currentIndex, openingBraceIndex));
    const closingBraceIndex = template.indexOf("}", openingBraceIndex);
    if (closingBraceIndex === -1) {
      evaluatedTemplateArr.push(template.slice(openingBraceIndex));
      break;
    }
    if (template[openingBraceIndex + 1] === "{" && template[closingBraceIndex + 1] === "}") {
      evaluatedTemplateArr.push(template.slice(openingBraceIndex + 1, closingBraceIndex));
      currentIndex = closingBraceIndex + 2;
    }
    const parameterName = template.substring(openingBraceIndex + 1, closingBraceIndex);
    if (parameterName.includes("#")) {
      const [refName, attrName] = parameterName.split("#");
      evaluatedTemplateArr.push(getAttr(templateContext[refName], attrName));
    } else {
      evaluatedTemplateArr.push(templateContext[parameterName]);
    }
    currentIndex = closingBraceIndex + 1;
  }
  return evaluatedTemplateArr.join("");
};
const getReferenceValue = ({ ref }, options) => {
  const referenceRecord = {
    ...options.endpointParams,
    ...options.referenceRecord
  };
  return referenceRecord[ref];
};
const evaluateExpression = (obj, keyName, options) => {
  if (typeof obj === "string") {
    return evaluateTemplate(obj, options);
  } else if (obj["fn"]) {
    return callFunction(obj, options);
  } else if (obj["ref"]) {
    return getReferenceValue(obj, options);
  }
  throw new EndpointError(`'${keyName}': ${String(obj)} is not a string, function or reference.`);
};
const callFunction = ({ fn, argv }, options) => {
  const evaluatedArgs = argv.map((arg) => ["boolean", "number"].includes(typeof arg) ? arg : evaluateExpression(arg, "arg", options));
  return fn.split(".").reduce((acc, key) => acc[key], lib)(...evaluatedArgs);
};
const evaluateCondition = ({ assign, ...fnArgs }, options) => {
  if (assign && assign in options.referenceRecord) {
    throw new EndpointError(`'${assign}' is already defined in Reference Record.`);
  }
  const value = callFunction(fnArgs, options);
  options.logger?.debug?.(debugId, `evaluateCondition: ${toDebugString(fnArgs)} = ${toDebugString(value)}`);
  return {
    result: value === "" ? true : !!value,
    ...assign != null && { toAssign: { name: assign, value } }
  };
};
const evaluateConditions = (conditions = [], options) => {
  const conditionsReferenceRecord = {};
  for (const condition of conditions) {
    const { result, toAssign } = evaluateCondition(condition, {
      ...options,
      referenceRecord: {
        ...options.referenceRecord,
        ...conditionsReferenceRecord
      }
    });
    if (!result) {
      return { result };
    }
    if (toAssign) {
      conditionsReferenceRecord[toAssign.name] = toAssign.value;
      options.logger?.debug?.(debugId, `assign: ${toAssign.name} := ${toDebugString(toAssign.value)}`);
    }
  }
  return { result: true, referenceRecord: conditionsReferenceRecord };
};
const getEndpointHeaders = (headers, options) => Object.entries(headers).reduce((acc, [headerKey, headerVal]) => ({
  ...acc,
  [headerKey]: headerVal.map((headerValEntry) => {
    const processedExpr = evaluateExpression(headerValEntry, "Header value entry", options);
    if (typeof processedExpr !== "string") {
      throw new EndpointError(`Header '${headerKey}' value '${processedExpr}' is not a string`);
    }
    return processedExpr;
  })
}), {});
const getEndpointProperty = (property, options) => {
  if (Array.isArray(property)) {
    return property.map((propertyEntry) => getEndpointProperty(propertyEntry, options));
  }
  switch (typeof property) {
    case "string":
      return evaluateTemplate(property, options);
    case "object":
      if (property === null) {
        throw new EndpointError(`Unexpected endpoint property: ${property}`);
      }
      return getEndpointProperties(property, options);
    case "boolean":
      return property;
    default:
      throw new EndpointError(`Unexpected endpoint property type: ${typeof property}`);
  }
};
const getEndpointProperties = (properties, options) => Object.entries(properties).reduce((acc, [propertyKey, propertyVal]) => ({
  ...acc,
  [propertyKey]: getEndpointProperty(propertyVal, options)
}), {});
const getEndpointUrl = (endpointUrl, options) => {
  const expression = evaluateExpression(endpointUrl, "Endpoint URL", options);
  if (typeof expression === "string") {
    try {
      return new URL(expression);
    } catch (error) {
      console.error(`Failed to construct URL with ${expression}`, error);
      throw error;
    }
  }
  throw new EndpointError(`Endpoint URL must be a string, got ${typeof expression}`);
};
const evaluateEndpointRule = (endpointRule, options) => {
  const { conditions, endpoint } = endpointRule;
  const { result, referenceRecord } = evaluateConditions(conditions, options);
  if (!result) {
    return;
  }
  const endpointRuleOptions = {
    ...options,
    referenceRecord: { ...options.referenceRecord, ...referenceRecord }
  };
  const { url, properties, headers } = endpoint;
  options.logger?.debug?.(debugId, `Resolving endpoint from template: ${toDebugString(endpoint)}`);
  return {
    ...headers != void 0 && {
      headers: getEndpointHeaders(headers, endpointRuleOptions)
    },
    ...properties != void 0 && {
      properties: getEndpointProperties(properties, endpointRuleOptions)
    },
    url: getEndpointUrl(url, endpointRuleOptions)
  };
};
const evaluateErrorRule = (errorRule, options) => {
  const { conditions, error } = errorRule;
  const { result, referenceRecord } = evaluateConditions(conditions, options);
  if (!result) {
    return;
  }
  throw new EndpointError(evaluateExpression(error, "Error", {
    ...options,
    referenceRecord: { ...options.referenceRecord, ...referenceRecord }
  }));
};
const evaluateTreeRule = (treeRule, options) => {
  const { conditions, rules } = treeRule;
  const { result, referenceRecord } = evaluateConditions(conditions, options);
  if (!result) {
    return;
  }
  return evaluateRules(rules, {
    ...options,
    referenceRecord: { ...options.referenceRecord, ...referenceRecord }
  });
};
const evaluateRules = (rules, options) => {
  for (const rule of rules) {
    if (rule.type === "endpoint") {
      const endpointOrUndefined = evaluateEndpointRule(rule, options);
      if (endpointOrUndefined) {
        return endpointOrUndefined;
      }
    } else if (rule.type === "error") {
      evaluateErrorRule(rule, options);
    } else if (rule.type === "tree") {
      const endpointOrUndefined = evaluateTreeRule(rule, options);
      if (endpointOrUndefined) {
        return endpointOrUndefined;
      }
    } else {
      throw new EndpointError(`Unknown endpoint rule: ${rule}`);
    }
  }
  throw new EndpointError(`Rules evaluation failed`);
};
const resolveEndpoint = (ruleSetObject, options) => {
  const { endpointParams, logger: logger2 } = options;
  const { parameters: parameters2, rules } = ruleSetObject;
  options.logger?.debug?.(debugId, `Initial EndpointParams: ${toDebugString(endpointParams)}`);
  const paramsWithDefault = Object.entries(parameters2).filter(([, v2]) => v2.default != null).map(([k2, v2]) => [k2, v2.default]);
  if (paramsWithDefault.length > 0) {
    for (const [paramKey, paramDefaultValue] of paramsWithDefault) {
      endpointParams[paramKey] = endpointParams[paramKey] ?? paramDefaultValue;
    }
  }
  const requiredParams = Object.entries(parameters2).filter(([, v2]) => v2.required).map(([k2]) => k2);
  for (const requiredParam of requiredParams) {
    if (endpointParams[requiredParam] == null) {
      throw new EndpointError(`Missing required parameter: '${requiredParam}'`);
    }
  }
  const endpoint = evaluateRules(rules, { endpointParams, logger: logger2, referenceRecord: {} });
  if (options.endpointParams?.Endpoint) {
    try {
      const givenEndpoint = new URL(options.endpointParams.Endpoint);
      const { protocol, port } = givenEndpoint;
      endpoint.url.protocol = protocol;
      endpoint.url.port = port;
    } catch (e2) {
    }
  }
  options.logger?.debug?.(debugId, `Resolved endpoint: ${toDebugString(endpoint)}`);
  return endpoint;
};
const p$3 = "required", q$3 = "fn", r$3 = "argv", s$3 = "ref";
const a$3 = "PartitionResult", b$3 = "tree", c$3 = "error", d$3 = "endpoint", e$3 = { [p$3]: false, "type": "String" }, f$3 = { [p$3]: true, "default": false, "type": "Boolean" }, g$3 = { [s$3]: "Endpoint" }, h$3 = { [q$3]: "booleanEquals", [r$3]: [{ [s$3]: "UseFIPS" }, true] }, i$3 = { [q$3]: "booleanEquals", [r$3]: [{ [s$3]: "UseDualStack" }, true] }, j$3 = {}, k$3 = { [q$3]: "booleanEquals", [r$3]: [true, { [q$3]: "getAttr", [r$3]: [{ [s$3]: a$3 }, "supportsFIPS"] }] }, l$3 = { [q$3]: "booleanEquals", [r$3]: [true, { [q$3]: "getAttr", [r$3]: [{ [s$3]: a$3 }, "supportsDualStack"] }] }, m$3 = [g$3], n$3 = [h$3], o$3 = [i$3];
const _data$3 = { version: "1.0", parameters: { Region: e$3, UseDualStack: f$3, UseFIPS: f$3, Endpoint: e$3 }, rules: [{ conditions: [{ [q$3]: "aws.partition", [r$3]: [{ [s$3]: "Region" }], assign: a$3 }], type: b$3, rules: [{ conditions: [{ [q$3]: "isSet", [r$3]: m$3 }, { [q$3]: "parseURL", [r$3]: m$3, assign: "url" }], type: b$3, rules: [{ conditions: n$3, error: "Invalid Configuration: FIPS and custom endpoint are not supported", type: c$3 }, { type: b$3, rules: [{ conditions: o$3, error: "Invalid Configuration: Dualstack and custom endpoint are not supported", type: c$3 }, { endpoint: { url: g$3, properties: j$3, headers: j$3 }, type: d$3 }] }] }, { conditions: [h$3, i$3], type: b$3, rules: [{ conditions: [k$3, l$3], type: b$3, rules: [{ endpoint: { url: "https://portal.sso-fips.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: j$3, headers: j$3 }, type: d$3 }] }, { error: "FIPS and DualStack are enabled, but this partition does not support one or both", type: c$3 }] }, { conditions: n$3, type: b$3, rules: [{ conditions: [k$3], type: b$3, rules: [{ type: b$3, rules: [{ endpoint: { url: "https://portal.sso-fips.{Region}.{PartitionResult#dnsSuffix}", properties: j$3, headers: j$3 }, type: d$3 }] }] }, { error: "FIPS is enabled but this partition does not support FIPS", type: c$3 }] }, { conditions: o$3, type: b$3, rules: [{ conditions: [l$3], type: b$3, rules: [{ endpoint: { url: "https://portal.sso.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: j$3, headers: j$3 }, type: d$3 }] }, { error: "DualStack is enabled but this partition does not support DualStack", type: c$3 }] }, { endpoint: { url: "https://portal.sso.{Region}.{PartitionResult#dnsSuffix}", properties: j$3, headers: j$3 }, type: d$3 }] }] };
const ruleSet$3 = _data$3;
const defaultEndpointResolver$3 = (endpointParams, context = {}) => {
  return resolveEndpoint(ruleSet$3, {
    endpointParams,
    logger: context.logger
  });
};
const getRuntimeConfig$7 = (config) => ({
  apiVersion: "2019-06-10",
  base64Decoder: config?.base64Decoder ?? fromBase64,
  base64Encoder: config?.base64Encoder ?? toBase64,
  disableHostPrefix: config?.disableHostPrefix ?? false,
  endpointProvider: config?.endpointProvider ?? defaultEndpointResolver$3,
  logger: config?.logger ?? new NoOpLogger(),
  serviceId: config?.serviceId ?? "SSO",
  urlParser: config?.urlParser ?? parseUrl,
  utf8Decoder: config?.utf8Decoder ?? fromUtf8,
  utf8Encoder: config?.utf8Encoder ?? toUtf8
});
const AWS_EXECUTION_ENV = "AWS_EXECUTION_ENV";
const AWS_REGION_ENV = "AWS_REGION";
const AWS_DEFAULT_REGION_ENV = "AWS_DEFAULT_REGION";
const ENV_IMDS_DISABLED$1 = "AWS_EC2_METADATA_DISABLED";
const DEFAULTS_MODE_OPTIONS = ["in-region", "cross-region", "mobile", "standard", "legacy"];
const IMDS_REGION_PATH = "/latest/meta-data/placement/region";
const AWS_DEFAULTS_MODE_ENV = "AWS_DEFAULTS_MODE";
const AWS_DEFAULTS_MODE_CONFIG = "defaults_mode";
const NODE_DEFAULTS_MODE_CONFIG_OPTIONS = {
  environmentVariableSelector: (env2) => {
    return env2[AWS_DEFAULTS_MODE_ENV];
  },
  configFileSelector: (profile) => {
    return profile[AWS_DEFAULTS_MODE_CONFIG];
  },
  default: "legacy"
};
const resolveDefaultsModeConfig = ({ region = loadConfig(NODE_REGION_CONFIG_OPTIONS), defaultsMode = loadConfig(NODE_DEFAULTS_MODE_CONFIG_OPTIONS) } = {}) => memoize(async () => {
  const mode = typeof defaultsMode === "function" ? await defaultsMode() : defaultsMode;
  switch (mode?.toLowerCase()) {
    case "auto":
      return resolveNodeDefaultsModeAuto(region);
    case "in-region":
    case "cross-region":
    case "mobile":
    case "standard":
    case "legacy":
      return Promise.resolve(mode?.toLocaleLowerCase());
    case void 0:
      return Promise.resolve("legacy");
    default:
      throw new Error(`Invalid parameter for "defaultsMode", expect ${DEFAULTS_MODE_OPTIONS.join(", ")}, got ${mode}`);
  }
});
const resolveNodeDefaultsModeAuto = async (clientRegion) => {
  if (clientRegion) {
    const resolvedRegion = typeof clientRegion === "function" ? await clientRegion() : clientRegion;
    const inferredRegion = await inferPhysicalRegion();
    if (!inferredRegion) {
      return "standard";
    }
    if (resolvedRegion === inferredRegion) {
      return "in-region";
    } else {
      return "cross-region";
    }
  }
  return "standard";
};
const inferPhysicalRegion = async () => {
  if (process.env[AWS_EXECUTION_ENV] && (process.env[AWS_REGION_ENV] || process.env[AWS_DEFAULT_REGION_ENV])) {
    return process.env[AWS_REGION_ENV] ?? process.env[AWS_DEFAULT_REGION_ENV];
  }
  if (!process.env[ENV_IMDS_DISABLED$1]) {
    try {
      const endpoint = await getInstanceMetadataEndpoint();
      return (await httpRequest({ ...endpoint, path: IMDS_REGION_PATH })).toString();
    } catch (e2) {
    }
  }
};
const getRuntimeConfig$6 = (config) => {
  emitWarningIfUnsupportedVersion(process.version);
  const defaultsMode = resolveDefaultsModeConfig(config);
  const defaultConfigProvider = () => defaultsMode().then(loadConfigsForDefaultMode);
  const clientSharedValues = getRuntimeConfig$7(config);
  return {
    ...clientSharedValues,
    ...config,
    runtime: "node",
    defaultsMode,
    bodyLengthChecker: config?.bodyLengthChecker ?? calculateBodyLength,
    defaultUserAgentProvider: config?.defaultUserAgentProvider ?? defaultUserAgent({ serviceId: clientSharedValues.serviceId, clientVersion: packageInfo$1.version }),
    maxAttempts: config?.maxAttempts ?? loadConfig(NODE_MAX_ATTEMPT_CONFIG_OPTIONS),
    region: config?.region ?? loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS),
    requestHandler: config?.requestHandler ?? new NodeHttpHandler(defaultConfigProvider),
    retryMode: config?.retryMode ?? loadConfig({
      ...NODE_RETRY_MODE_CONFIG_OPTIONS,
      default: async () => (await defaultConfigProvider()).retryMode || DEFAULT_RETRY_MODE
    }),
    sha256: config?.sha256 ?? Hash.bind(null, "sha256"),
    streamCollector: config?.streamCollector ?? streamCollector,
    useDualstackEndpoint: config?.useDualstackEndpoint ?? loadConfig(NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS),
    useFipsEndpoint: config?.useFipsEndpoint ?? loadConfig(NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS)
  };
};
class SSOClient extends Client {
  constructor(configuration) {
    const _config_0 = getRuntimeConfig$6(configuration);
    const _config_1 = resolveClientEndpointParameters$1(_config_0);
    const _config_2 = resolveRegionConfig(_config_1);
    const _config_3 = resolveEndpointConfig(_config_2);
    const _config_4 = resolveRetryConfig(_config_3);
    const _config_5 = resolveHostHeaderConfig(_config_4);
    const _config_6 = resolveUserAgentConfig(_config_5);
    super(_config_6);
    this.config = _config_6;
    this.middlewareStack.use(getRetryPlugin(this.config));
    this.middlewareStack.use(getContentLengthPlugin(this.config));
    this.middlewareStack.use(getHostHeaderPlugin(this.config));
    this.middlewareStack.use(getLoggerPlugin(this.config));
    this.middlewareStack.use(getRecursionDetectionPlugin(this.config));
    this.middlewareStack.use(getUserAgentPlugin(this.config));
  }
  destroy() {
    super.destroy();
  }
}
const EXPIRE_WINDOW_MS$1 = 5 * 60 * 1e3;
const REFRESH_MESSAGE = `To refresh this SSO session run 'aws sso login' with the corresponding profile.`;
class SSOOIDCServiceException extends ServiceException {
  constructor(options) {
    super(options);
    Object.setPrototypeOf(this, SSOOIDCServiceException.prototype);
  }
}
class AccessDeniedException extends SSOOIDCServiceException {
  constructor(opts) {
    super({
      name: "AccessDeniedException",
      $fault: "client",
      ...opts
    });
    this.name = "AccessDeniedException";
    this.$fault = "client";
    Object.setPrototypeOf(this, AccessDeniedException.prototype);
    this.error = opts.error;
    this.error_description = opts.error_description;
  }
}
class AuthorizationPendingException extends SSOOIDCServiceException {
  constructor(opts) {
    super({
      name: "AuthorizationPendingException",
      $fault: "client",
      ...opts
    });
    this.name = "AuthorizationPendingException";
    this.$fault = "client";
    Object.setPrototypeOf(this, AuthorizationPendingException.prototype);
    this.error = opts.error;
    this.error_description = opts.error_description;
  }
}
class ExpiredTokenException2 extends SSOOIDCServiceException {
  constructor(opts) {
    super({
      name: "ExpiredTokenException",
      $fault: "client",
      ...opts
    });
    this.name = "ExpiredTokenException";
    this.$fault = "client";
    Object.setPrototypeOf(this, ExpiredTokenException2.prototype);
    this.error = opts.error;
    this.error_description = opts.error_description;
  }
}
class InternalServerException extends SSOOIDCServiceException {
  constructor(opts) {
    super({
      name: "InternalServerException",
      $fault: "server",
      ...opts
    });
    this.name = "InternalServerException";
    this.$fault = "server";
    Object.setPrototypeOf(this, InternalServerException.prototype);
    this.error = opts.error;
    this.error_description = opts.error_description;
  }
}
class InvalidClientException extends SSOOIDCServiceException {
  constructor(opts) {
    super({
      name: "InvalidClientException",
      $fault: "client",
      ...opts
    });
    this.name = "InvalidClientException";
    this.$fault = "client";
    Object.setPrototypeOf(this, InvalidClientException.prototype);
    this.error = opts.error;
    this.error_description = opts.error_description;
  }
}
class InvalidGrantException extends SSOOIDCServiceException {
  constructor(opts) {
    super({
      name: "InvalidGrantException",
      $fault: "client",
      ...opts
    });
    this.name = "InvalidGrantException";
    this.$fault = "client";
    Object.setPrototypeOf(this, InvalidGrantException.prototype);
    this.error = opts.error;
    this.error_description = opts.error_description;
  }
}
class InvalidRequestException2 extends SSOOIDCServiceException {
  constructor(opts) {
    super({
      name: "InvalidRequestException",
      $fault: "client",
      ...opts
    });
    this.name = "InvalidRequestException";
    this.$fault = "client";
    Object.setPrototypeOf(this, InvalidRequestException2.prototype);
    this.error = opts.error;
    this.error_description = opts.error_description;
  }
}
class InvalidScopeException extends SSOOIDCServiceException {
  constructor(opts) {
    super({
      name: "InvalidScopeException",
      $fault: "client",
      ...opts
    });
    this.name = "InvalidScopeException";
    this.$fault = "client";
    Object.setPrototypeOf(this, InvalidScopeException.prototype);
    this.error = opts.error;
    this.error_description = opts.error_description;
  }
}
class SlowDownException extends SSOOIDCServiceException {
  constructor(opts) {
    super({
      name: "SlowDownException",
      $fault: "client",
      ...opts
    });
    this.name = "SlowDownException";
    this.$fault = "client";
    Object.setPrototypeOf(this, SlowDownException.prototype);
    this.error = opts.error;
    this.error_description = opts.error_description;
  }
}
class UnauthorizedClientException extends SSOOIDCServiceException {
  constructor(opts) {
    super({
      name: "UnauthorizedClientException",
      $fault: "client",
      ...opts
    });
    this.name = "UnauthorizedClientException";
    this.$fault = "client";
    Object.setPrototypeOf(this, UnauthorizedClientException.prototype);
    this.error = opts.error;
    this.error_description = opts.error_description;
  }
}
class UnsupportedGrantTypeException extends SSOOIDCServiceException {
  constructor(opts) {
    super({
      name: "UnsupportedGrantTypeException",
      $fault: "client",
      ...opts
    });
    this.name = "UnsupportedGrantTypeException";
    this.$fault = "client";
    Object.setPrototypeOf(this, UnsupportedGrantTypeException.prototype);
    this.error = opts.error;
    this.error_description = opts.error_description;
  }
}
const CreateTokenRequestFilterSensitiveLog = (obj) => ({
  ...obj
});
const CreateTokenResponseFilterSensitiveLog = (obj) => ({
  ...obj
});
const serializeAws_restJson1CreateTokenCommand = async (input, context) => {
  const { hostname, protocol = "https", port, path: basePath } = await context.endpoint();
  const headers = {
    "content-type": "application/json"
  };
  const resolvedPath = `${basePath?.endsWith("/") ? basePath.slice(0, -1) : basePath || ""}/token`;
  let body;
  body = JSON.stringify({
    ...input.clientId != null && { clientId: input.clientId },
    ...input.clientSecret != null && { clientSecret: input.clientSecret },
    ...input.code != null && { code: input.code },
    ...input.deviceCode != null && { deviceCode: input.deviceCode },
    ...input.grantType != null && { grantType: input.grantType },
    ...input.redirectUri != null && { redirectUri: input.redirectUri },
    ...input.refreshToken != null && { refreshToken: input.refreshToken },
    ...input.scope != null && { scope: serializeAws_restJson1Scopes(input.scope) }
  });
  return new HttpRequest({
    protocol,
    hostname,
    port,
    method: "POST",
    headers,
    path: resolvedPath,
    body
  });
};
const deserializeAws_restJson1CreateTokenCommand = async (output, context) => {
  if (output.statusCode !== 200 && output.statusCode >= 300) {
    return deserializeAws_restJson1CreateTokenCommandError(output, context);
  }
  const contents = map({
    $metadata: deserializeMetadata(output)
  });
  const data = expectNonNull(expectObject(await parseBody(output.body, context)), "body");
  if (data.accessToken != null) {
    contents.accessToken = expectString(data.accessToken);
  }
  if (data.expiresIn != null) {
    contents.expiresIn = expectInt32(data.expiresIn);
  }
  if (data.idToken != null) {
    contents.idToken = expectString(data.idToken);
  }
  if (data.refreshToken != null) {
    contents.refreshToken = expectString(data.refreshToken);
  }
  if (data.tokenType != null) {
    contents.tokenType = expectString(data.tokenType);
  }
  return contents;
};
const deserializeAws_restJson1CreateTokenCommandError = async (output, context) => {
  const parsedOutput = {
    ...output,
    body: await parseErrorBody(output.body, context)
  };
  const errorCode = loadRestJsonErrorCode(output, parsedOutput.body);
  switch (errorCode) {
    case "AccessDeniedException":
    case "com.amazonaws.ssooidc#AccessDeniedException":
      throw await deserializeAws_restJson1AccessDeniedExceptionResponse(parsedOutput);
    case "AuthorizationPendingException":
    case "com.amazonaws.ssooidc#AuthorizationPendingException":
      throw await deserializeAws_restJson1AuthorizationPendingExceptionResponse(parsedOutput);
    case "ExpiredTokenException":
    case "com.amazonaws.ssooidc#ExpiredTokenException":
      throw await deserializeAws_restJson1ExpiredTokenExceptionResponse(parsedOutput);
    case "InternalServerException":
    case "com.amazonaws.ssooidc#InternalServerException":
      throw await deserializeAws_restJson1InternalServerExceptionResponse(parsedOutput);
    case "InvalidClientException":
    case "com.amazonaws.ssooidc#InvalidClientException":
      throw await deserializeAws_restJson1InvalidClientExceptionResponse(parsedOutput);
    case "InvalidGrantException":
    case "com.amazonaws.ssooidc#InvalidGrantException":
      throw await deserializeAws_restJson1InvalidGrantExceptionResponse(parsedOutput);
    case "InvalidRequestException":
    case "com.amazonaws.ssooidc#InvalidRequestException":
      throw await deserializeAws_restJson1InvalidRequestExceptionResponse(parsedOutput);
    case "InvalidScopeException":
    case "com.amazonaws.ssooidc#InvalidScopeException":
      throw await deserializeAws_restJson1InvalidScopeExceptionResponse(parsedOutput);
    case "SlowDownException":
    case "com.amazonaws.ssooidc#SlowDownException":
      throw await deserializeAws_restJson1SlowDownExceptionResponse(parsedOutput);
    case "UnauthorizedClientException":
    case "com.amazonaws.ssooidc#UnauthorizedClientException":
      throw await deserializeAws_restJson1UnauthorizedClientExceptionResponse(parsedOutput);
    case "UnsupportedGrantTypeException":
    case "com.amazonaws.ssooidc#UnsupportedGrantTypeException":
      throw await deserializeAws_restJson1UnsupportedGrantTypeExceptionResponse(parsedOutput);
    default:
      const parsedBody = parsedOutput.body;
      throwDefaultError({
        output,
        parsedBody,
        exceptionCtor: SSOOIDCServiceException,
        errorCode
      });
  }
};
const map = map$2;
const deserializeAws_restJson1AccessDeniedExceptionResponse = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  if (data.error != null) {
    contents.error = expectString(data.error);
  }
  if (data.error_description != null) {
    contents.error_description = expectString(data.error_description);
  }
  const exception = new AccessDeniedException({
    $metadata: deserializeMetadata(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1AuthorizationPendingExceptionResponse = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  if (data.error != null) {
    contents.error = expectString(data.error);
  }
  if (data.error_description != null) {
    contents.error_description = expectString(data.error_description);
  }
  const exception = new AuthorizationPendingException({
    $metadata: deserializeMetadata(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1ExpiredTokenExceptionResponse = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  if (data.error != null) {
    contents.error = expectString(data.error);
  }
  if (data.error_description != null) {
    contents.error_description = expectString(data.error_description);
  }
  const exception = new ExpiredTokenException2({
    $metadata: deserializeMetadata(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1InternalServerExceptionResponse = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  if (data.error != null) {
    contents.error = expectString(data.error);
  }
  if (data.error_description != null) {
    contents.error_description = expectString(data.error_description);
  }
  const exception = new InternalServerException({
    $metadata: deserializeMetadata(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1InvalidClientExceptionResponse = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  if (data.error != null) {
    contents.error = expectString(data.error);
  }
  if (data.error_description != null) {
    contents.error_description = expectString(data.error_description);
  }
  const exception = new InvalidClientException({
    $metadata: deserializeMetadata(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1InvalidGrantExceptionResponse = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  if (data.error != null) {
    contents.error = expectString(data.error);
  }
  if (data.error_description != null) {
    contents.error_description = expectString(data.error_description);
  }
  const exception = new InvalidGrantException({
    $metadata: deserializeMetadata(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1InvalidRequestExceptionResponse = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  if (data.error != null) {
    contents.error = expectString(data.error);
  }
  if (data.error_description != null) {
    contents.error_description = expectString(data.error_description);
  }
  const exception = new InvalidRequestException2({
    $metadata: deserializeMetadata(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1InvalidScopeExceptionResponse = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  if (data.error != null) {
    contents.error = expectString(data.error);
  }
  if (data.error_description != null) {
    contents.error_description = expectString(data.error_description);
  }
  const exception = new InvalidScopeException({
    $metadata: deserializeMetadata(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1SlowDownExceptionResponse = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  if (data.error != null) {
    contents.error = expectString(data.error);
  }
  if (data.error_description != null) {
    contents.error_description = expectString(data.error_description);
  }
  const exception = new SlowDownException({
    $metadata: deserializeMetadata(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1UnauthorizedClientExceptionResponse = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  if (data.error != null) {
    contents.error = expectString(data.error);
  }
  if (data.error_description != null) {
    contents.error_description = expectString(data.error_description);
  }
  const exception = new UnauthorizedClientException({
    $metadata: deserializeMetadata(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const deserializeAws_restJson1UnsupportedGrantTypeExceptionResponse = async (parsedOutput, context) => {
  const contents = map({});
  const data = parsedOutput.body;
  if (data.error != null) {
    contents.error = expectString(data.error);
  }
  if (data.error_description != null) {
    contents.error_description = expectString(data.error_description);
  }
  const exception = new UnsupportedGrantTypeException({
    $metadata: deserializeMetadata(parsedOutput),
    ...contents
  });
  return decorateServiceException(exception, parsedOutput.body);
};
const serializeAws_restJson1Scopes = (input, context) => {
  return input.filter((e2) => e2 != null).map((entry) => {
    return entry;
  });
};
const deserializeMetadata = (output) => ({
  httpStatusCode: output.statusCode,
  requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
  extendedRequestId: output.headers["x-amz-id-2"],
  cfId: output.headers["x-amz-cf-id"]
});
const collectBody = (streamBody = new Uint8Array(), context) => {
  if (streamBody instanceof Uint8Array) {
    return Promise.resolve(streamBody);
  }
  return context.streamCollector(streamBody) || Promise.resolve(new Uint8Array());
};
const collectBodyString = (streamBody, context) => collectBody(streamBody, context).then((body) => context.utf8Encoder(body));
const parseBody = (streamBody, context) => collectBodyString(streamBody, context).then((encoded) => {
  if (encoded.length) {
    return JSON.parse(encoded);
  }
  return {};
});
const parseErrorBody = async (errorBody, context) => {
  const value = await parseBody(errorBody, context);
  value.message = value.message ?? value.Message;
  return value;
};
const loadRestJsonErrorCode = (output, data) => {
  const findKey = (object, key) => Object.keys(object).find((k2) => k2.toLowerCase() === key.toLowerCase());
  const sanitizeErrorCode = (rawValue) => {
    let cleanValue = rawValue;
    if (typeof cleanValue === "number") {
      cleanValue = cleanValue.toString();
    }
    if (cleanValue.indexOf(",") >= 0) {
      cleanValue = cleanValue.split(",")[0];
    }
    if (cleanValue.indexOf(":") >= 0) {
      cleanValue = cleanValue.split(":")[0];
    }
    if (cleanValue.indexOf("#") >= 0) {
      cleanValue = cleanValue.split("#")[1];
    }
    return cleanValue;
  };
  const headerKey = findKey(output.headers, "x-amzn-errortype");
  if (headerKey !== void 0) {
    return sanitizeErrorCode(output.headers[headerKey]);
  }
  if (data.code !== void 0) {
    return sanitizeErrorCode(data.code);
  }
  if (data["__type"] !== void 0) {
    return sanitizeErrorCode(data["__type"]);
  }
};
class CreateTokenCommand extends Command {
  constructor(input) {
    super();
    this.input = input;
  }
  static getEndpointParameterInstructions() {
    return {
      UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
      Endpoint: { type: "builtInParams", name: "endpoint" },
      Region: { type: "builtInParams", name: "region" },
      UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" }
    };
  }
  resolveMiddleware(clientStack, configuration, options) {
    this.middlewareStack.use(getSerdePlugin(configuration, this.serialize, this.deserialize));
    this.middlewareStack.use(getEndpointPlugin(configuration, CreateTokenCommand.getEndpointParameterInstructions()));
    const stack = clientStack.concat(this.middlewareStack);
    const { logger: logger2 } = configuration;
    const clientName = "SSOOIDCClient";
    const commandName = "CreateTokenCommand";
    const handlerExecutionContext = {
      logger: logger2,
      clientName,
      commandName,
      inputFilterSensitiveLog: CreateTokenRequestFilterSensitiveLog,
      outputFilterSensitiveLog: CreateTokenResponseFilterSensitiveLog
    };
    const { requestHandler } = configuration;
    return stack.resolve((request2) => requestHandler.handle(request2.request, options || {}), handlerExecutionContext);
  }
  serialize(input, context) {
    return serializeAws_restJson1CreateTokenCommand(input, context);
  }
  deserialize(output, context) {
    return deserializeAws_restJson1CreateTokenCommand(output, context);
  }
}
const resolveClientEndpointParameters = (options) => {
  return {
    ...options,
    useDualstackEndpoint: options.useDualstackEndpoint ?? false,
    useFipsEndpoint: options.useFipsEndpoint ?? false,
    defaultSigningName: "awsssooidc"
  };
};
const name = "@aws-sdk/client-sso-oidc";
const description = "AWS SDK for JavaScript Sso Oidc Client for Node.js, Browser and React Native";
const version = "3.279.0";
const scripts = {
  build: "concurrently 'yarn:build:cjs' 'yarn:build:es' 'yarn:build:types'",
  "build:cjs": "tsc -p tsconfig.cjs.json",
  "build:docs": "typedoc",
  "build:es": "tsc -p tsconfig.es.json",
  "build:include:deps": "lerna run --scope $npm_package_name --include-dependencies build",
  "build:types": "tsc -p tsconfig.types.json",
  "build:types:downlevel": "downlevel-dts dist-types dist-types/ts3.4",
  clean: "rimraf ./dist-* && rimraf *.tsbuildinfo",
  "generate:client": "node ../../scripts/generate-clients/single-service --solo sso-oidc"
};
const main = "./dist-cjs/index.js";
const types = "./dist-types/index.d.ts";
const module$1 = "./dist-es/index.js";
const sideEffects = false;
const dependencies = {
  "@aws-crypto/sha256-browser": "3.0.0",
  "@aws-crypto/sha256-js": "3.0.0",
  "@aws-sdk/config-resolver": "3.272.0",
  "@aws-sdk/fetch-http-handler": "3.272.0",
  "@aws-sdk/hash-node": "3.272.0",
  "@aws-sdk/invalid-dependency": "3.272.0",
  "@aws-sdk/middleware-content-length": "3.272.0",
  "@aws-sdk/middleware-endpoint": "3.272.0",
  "@aws-sdk/middleware-host-header": "3.278.0",
  "@aws-sdk/middleware-logger": "3.272.0",
  "@aws-sdk/middleware-recursion-detection": "3.272.0",
  "@aws-sdk/middleware-retry": "3.272.0",
  "@aws-sdk/middleware-serde": "3.272.0",
  "@aws-sdk/middleware-stack": "3.272.0",
  "@aws-sdk/middleware-user-agent": "3.272.0",
  "@aws-sdk/node-config-provider": "3.272.0",
  "@aws-sdk/node-http-handler": "3.272.0",
  "@aws-sdk/protocol-http": "3.272.0",
  "@aws-sdk/smithy-client": "3.279.0",
  "@aws-sdk/types": "3.272.0",
  "@aws-sdk/url-parser": "3.272.0",
  "@aws-sdk/util-base64": "3.208.0",
  "@aws-sdk/util-body-length-browser": "3.188.0",
  "@aws-sdk/util-body-length-node": "3.208.0",
  "@aws-sdk/util-defaults-mode-browser": "3.279.0",
  "@aws-sdk/util-defaults-mode-node": "3.279.0",
  "@aws-sdk/util-endpoints": "3.272.0",
  "@aws-sdk/util-retry": "3.272.0",
  "@aws-sdk/util-user-agent-browser": "3.272.0",
  "@aws-sdk/util-user-agent-node": "3.272.0",
  "@aws-sdk/util-utf8": "3.254.0",
  tslib: "^2.3.1"
};
const devDependencies = {
  "@aws-sdk/service-client-documentation-generator": "3.208.0",
  "@tsconfig/node14": "1.0.3",
  "@types/node": "^14.14.31",
  concurrently: "7.0.0",
  "downlevel-dts": "0.10.1",
  rimraf: "3.0.2",
  typedoc: "0.19.2",
  typescript: "~4.6.2"
};
const overrides = {
  typedoc: {
    typescript: "~4.6.2"
  }
};
const engines = {
  node: ">=14.0.0"
};
const typesVersions = {
  "<4.0": {
    "dist-types/*": [
      "dist-types/ts3.4/*"
    ]
  }
};
const files = [
  "dist-*"
];
const author = {
  name: "AWS SDK for JavaScript Team",
  url: "https://aws.amazon.com/javascript/"
};
const license = "Apache-2.0";
const browser = {
  "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.browser"
};
const homepage = "https://github.com/aws/aws-sdk-js-v3/tree/main/clients/client-sso-oidc";
const repository = {
  type: "git",
  url: "https://github.com/aws/aws-sdk-js-v3.git",
  directory: "clients/client-sso-oidc"
};
const packageInfo = {
  name,
  description,
  version,
  scripts,
  main,
  types,
  module: module$1,
  sideEffects,
  dependencies,
  devDependencies,
  overrides,
  engines,
  typesVersions,
  files,
  author,
  license,
  browser,
  "react-native": {
    "./dist-es/runtimeConfig": "./dist-es/runtimeConfig.native"
  },
  homepage,
  repository
};
const p$2 = "required", q$2 = "fn", r$2 = "argv", s$2 = "ref";
const a$2 = "PartitionResult", b$2 = "tree", c$2 = "error", d$2 = "endpoint", e$2 = { [p$2]: false, "type": "String" }, f$2 = { [p$2]: true, "default": false, "type": "Boolean" }, g$2 = { [s$2]: "Endpoint" }, h$2 = { [q$2]: "booleanEquals", [r$2]: [{ [s$2]: "UseFIPS" }, true] }, i$2 = { [q$2]: "booleanEquals", [r$2]: [{ [s$2]: "UseDualStack" }, true] }, j$2 = {}, k$2 = { [q$2]: "booleanEquals", [r$2]: [true, { [q$2]: "getAttr", [r$2]: [{ [s$2]: a$2 }, "supportsFIPS"] }] }, l$2 = { [q$2]: "booleanEquals", [r$2]: [true, { [q$2]: "getAttr", [r$2]: [{ [s$2]: a$2 }, "supportsDualStack"] }] }, m$2 = [g$2], n$2 = [h$2], o$2 = [i$2];
const _data$2 = { version: "1.0", parameters: { Region: e$2, UseDualStack: f$2, UseFIPS: f$2, Endpoint: e$2 }, rules: [{ conditions: [{ [q$2]: "aws.partition", [r$2]: [{ [s$2]: "Region" }], assign: a$2 }], type: b$2, rules: [{ conditions: [{ [q$2]: "isSet", [r$2]: m$2 }, { [q$2]: "parseURL", [r$2]: m$2, assign: "url" }], type: b$2, rules: [{ conditions: n$2, error: "Invalid Configuration: FIPS and custom endpoint are not supported", type: c$2 }, { type: b$2, rules: [{ conditions: o$2, error: "Invalid Configuration: Dualstack and custom endpoint are not supported", type: c$2 }, { endpoint: { url: g$2, properties: j$2, headers: j$2 }, type: d$2 }] }] }, { conditions: [h$2, i$2], type: b$2, rules: [{ conditions: [k$2, l$2], type: b$2, rules: [{ endpoint: { url: "https://oidc-fips.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: j$2, headers: j$2 }, type: d$2 }] }, { error: "FIPS and DualStack are enabled, but this partition does not support one or both", type: c$2 }] }, { conditions: n$2, type: b$2, rules: [{ conditions: [k$2], type: b$2, rules: [{ type: b$2, rules: [{ endpoint: { url: "https://oidc-fips.{Region}.{PartitionResult#dnsSuffix}", properties: j$2, headers: j$2 }, type: d$2 }] }] }, { error: "FIPS is enabled but this partition does not support FIPS", type: c$2 }] }, { conditions: o$2, type: b$2, rules: [{ conditions: [l$2], type: b$2, rules: [{ endpoint: { url: "https://oidc.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: j$2, headers: j$2 }, type: d$2 }] }, { error: "DualStack is enabled but this partition does not support DualStack", type: c$2 }] }, { endpoint: { url: "https://oidc.{Region}.{PartitionResult#dnsSuffix}", properties: j$2, headers: j$2 }, type: d$2 }] }] };
const ruleSet$2 = _data$2;
const defaultEndpointResolver$2 = (endpointParams, context = {}) => {
  return resolveEndpoint(ruleSet$2, {
    endpointParams,
    logger: context.logger
  });
};
const getRuntimeConfig$5 = (config) => ({
  apiVersion: "2019-06-10",
  base64Decoder: config?.base64Decoder ?? fromBase64,
  base64Encoder: config?.base64Encoder ?? toBase64,
  disableHostPrefix: config?.disableHostPrefix ?? false,
  endpointProvider: config?.endpointProvider ?? defaultEndpointResolver$2,
  logger: config?.logger ?? new NoOpLogger(),
  serviceId: config?.serviceId ?? "SSO OIDC",
  urlParser: config?.urlParser ?? parseUrl,
  utf8Decoder: config?.utf8Decoder ?? fromUtf8,
  utf8Encoder: config?.utf8Encoder ?? toUtf8
});
const getRuntimeConfig$4 = (config) => {
  emitWarningIfUnsupportedVersion(process.version);
  const defaultsMode = resolveDefaultsModeConfig(config);
  const defaultConfigProvider = () => defaultsMode().then(loadConfigsForDefaultMode);
  const clientSharedValues = getRuntimeConfig$5(config);
  return {
    ...clientSharedValues,
    ...config,
    runtime: "node",
    defaultsMode,
    bodyLengthChecker: config?.bodyLengthChecker ?? calculateBodyLength,
    defaultUserAgentProvider: config?.defaultUserAgentProvider ?? defaultUserAgent({ serviceId: clientSharedValues.serviceId, clientVersion: packageInfo.version }),
    maxAttempts: config?.maxAttempts ?? loadConfig(NODE_MAX_ATTEMPT_CONFIG_OPTIONS),
    region: config?.region ?? loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS),
    requestHandler: config?.requestHandler ?? new NodeHttpHandler(defaultConfigProvider),
    retryMode: config?.retryMode ?? loadConfig({
      ...NODE_RETRY_MODE_CONFIG_OPTIONS,
      default: async () => (await defaultConfigProvider()).retryMode || DEFAULT_RETRY_MODE
    }),
    sha256: config?.sha256 ?? Hash.bind(null, "sha256"),
    streamCollector: config?.streamCollector ?? streamCollector,
    useDualstackEndpoint: config?.useDualstackEndpoint ?? loadConfig(NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS),
    useFipsEndpoint: config?.useFipsEndpoint ?? loadConfig(NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS)
  };
};
class SSOOIDCClient extends Client {
  constructor(configuration) {
    const _config_0 = getRuntimeConfig$4(configuration);
    const _config_1 = resolveClientEndpointParameters(_config_0);
    const _config_2 = resolveRegionConfig(_config_1);
    const _config_3 = resolveEndpointConfig(_config_2);
    const _config_4 = resolveRetryConfig(_config_3);
    const _config_5 = resolveHostHeaderConfig(_config_4);
    const _config_6 = resolveUserAgentConfig(_config_5);
    super(_config_6);
    this.config = _config_6;
    this.middlewareStack.use(getRetryPlugin(this.config));
    this.middlewareStack.use(getContentLengthPlugin(this.config));
    this.middlewareStack.use(getHostHeaderPlugin(this.config));
    this.middlewareStack.use(getLoggerPlugin(this.config));
    this.middlewareStack.use(getRecursionDetectionPlugin(this.config));
    this.middlewareStack.use(getUserAgentPlugin(this.config));
  }
  destroy() {
    super.destroy();
  }
}
const ssoOidcClientsHash = {};
const getSsoOidcClient = (ssoRegion) => {
  if (ssoOidcClientsHash[ssoRegion]) {
    return ssoOidcClientsHash[ssoRegion];
  }
  const ssoOidcClient = new SSOOIDCClient({ region: ssoRegion });
  ssoOidcClientsHash[ssoRegion] = ssoOidcClient;
  return ssoOidcClient;
};
const getNewSsoOidcToken = (ssoToken, ssoRegion) => {
  const ssoOidcClient = getSsoOidcClient(ssoRegion);
  return ssoOidcClient.send(new CreateTokenCommand({
    clientId: ssoToken.clientId,
    clientSecret: ssoToken.clientSecret,
    refreshToken: ssoToken.refreshToken,
    grantType: "refresh_token"
  }));
};
const validateTokenExpiry = (token) => {
  if (token.expiration && token.expiration.getTime() < Date.now()) {
    throw new TokenProviderError(`Token is expired. ${REFRESH_MESSAGE}`, false);
  }
};
const validateTokenKey = (key, value, forRefresh = false) => {
  if (typeof value === "undefined") {
    throw new TokenProviderError(`Value not present for '${key}' in SSO Token${forRefresh ? ". Cannot refresh" : ""}. ${REFRESH_MESSAGE}`, false);
  }
};
const { writeFile } = promises;
const writeSSOTokenToFile = (id, ssoToken) => {
  const tokenFilepath = getSSOTokenFilepath(id);
  const tokenString = JSON.stringify(ssoToken, null, 2);
  return writeFile(tokenFilepath, tokenString);
};
const lastRefreshAttemptTime = /* @__PURE__ */ new Date(0);
const fromSso = (init = {}) => async () => {
  const profiles = await parseKnownFiles(init);
  const profileName = getProfileName(init);
  const profile = profiles[profileName];
  if (!profile) {
    throw new TokenProviderError(`Profile '${profileName}' could not be found in shared credentials file.`, false);
  } else if (!profile["sso_session"]) {
    throw new TokenProviderError(`Profile '${profileName}' is missing required property 'sso_session'.`);
  }
  const ssoSessionName = profile["sso_session"];
  const ssoSessions = await loadSsoSessionData(init);
  const ssoSession = ssoSessions[ssoSessionName];
  if (!ssoSession) {
    throw new TokenProviderError(`Sso session '${ssoSessionName}' could not be found in shared credentials file.`, false);
  }
  for (const ssoSessionRequiredKey of ["sso_start_url", "sso_region"]) {
    if (!ssoSession[ssoSessionRequiredKey]) {
      throw new TokenProviderError(`Sso session '${ssoSessionName}' is missing required property '${ssoSessionRequiredKey}'.`, false);
    }
  }
  ssoSession["sso_start_url"];
  const ssoRegion = ssoSession["sso_region"];
  let ssoToken;
  try {
    ssoToken = await getSSOTokenFromFile(ssoSessionName);
  } catch (e2) {
    throw new TokenProviderError(`The SSO session token associated with profile=${profileName} was not found or is invalid. ${REFRESH_MESSAGE}`, false);
  }
  validateTokenKey("accessToken", ssoToken.accessToken);
  validateTokenKey("expiresAt", ssoToken.expiresAt);
  const { accessToken, expiresAt } = ssoToken;
  const existingToken = { token: accessToken, expiration: new Date(expiresAt) };
  if (existingToken.expiration.getTime() - Date.now() > EXPIRE_WINDOW_MS$1) {
    return existingToken;
  }
  if (Date.now() - lastRefreshAttemptTime.getTime() < 30 * 1e3) {
    validateTokenExpiry(existingToken);
    return existingToken;
  }
  validateTokenKey("clientId", ssoToken.clientId, true);
  validateTokenKey("clientSecret", ssoToken.clientSecret, true);
  validateTokenKey("refreshToken", ssoToken.refreshToken, true);
  try {
    lastRefreshAttemptTime.setTime(Date.now());
    const newSsoOidcToken = await getNewSsoOidcToken(ssoToken, ssoRegion);
    validateTokenKey("accessToken", newSsoOidcToken.accessToken);
    validateTokenKey("expiresIn", newSsoOidcToken.expiresIn);
    const newTokenExpiration = new Date(Date.now() + newSsoOidcToken.expiresIn * 1e3);
    try {
      await writeSSOTokenToFile(ssoSessionName, {
        ...ssoToken,
        accessToken: newSsoOidcToken.accessToken,
        expiresAt: newTokenExpiration.toISOString(),
        refreshToken: newSsoOidcToken.refreshToken
      });
    } catch (error) {
    }
    return {
      token: newSsoOidcToken.accessToken,
      expiration: newTokenExpiration
    };
  } catch (error) {
    validateTokenExpiry(existingToken);
    return existingToken;
  }
};
const EXPIRE_WINDOW_MS = 15 * 60 * 1e3;
const SHOULD_FAIL_CREDENTIAL_CHAIN = false;
const resolveSSOCredentials = async ({ ssoStartUrl, ssoSession, ssoAccountId, ssoRegion, ssoRoleName, ssoClient, profile }) => {
  let token;
  const refreshMessage = `To refresh this SSO session run aws sso login with the corresponding profile.`;
  if (ssoSession) {
    try {
      const _token = await fromSso({ profile })();
      token = {
        accessToken: _token.token,
        expiresAt: new Date(_token.expiration).toISOString()
      };
    } catch (e2) {
      throw new CredentialsProviderError(e2.message, SHOULD_FAIL_CREDENTIAL_CHAIN);
    }
  } else {
    try {
      token = await getSSOTokenFromFile(ssoStartUrl);
    } catch (e2) {
      throw new CredentialsProviderError(`The SSO session associated with this profile is invalid. ${refreshMessage}`, SHOULD_FAIL_CREDENTIAL_CHAIN);
    }
  }
  if (new Date(token.expiresAt).getTime() - Date.now() <= EXPIRE_WINDOW_MS) {
    throw new CredentialsProviderError(`The SSO session associated with this profile has expired. ${refreshMessage}`, SHOULD_FAIL_CREDENTIAL_CHAIN);
  }
  const { accessToken } = token;
  const sso = ssoClient || new SSOClient({ region: ssoRegion });
  let ssoResp;
  try {
    ssoResp = await sso.send(new GetRoleCredentialsCommand({
      accountId: ssoAccountId,
      roleName: ssoRoleName,
      accessToken
    }));
  } catch (e2) {
    throw CredentialsProviderError.from(e2, SHOULD_FAIL_CREDENTIAL_CHAIN);
  }
  const { roleCredentials: { accessKeyId, secretAccessKey, sessionToken, expiration } = {} } = ssoResp;
  if (!accessKeyId || !secretAccessKey || !sessionToken || !expiration) {
    throw new CredentialsProviderError("SSO returns an invalid temporary credential.", SHOULD_FAIL_CREDENTIAL_CHAIN);
  }
  return { accessKeyId, secretAccessKey, sessionToken, expiration: new Date(expiration) };
};
const validateSsoProfile = (profile) => {
  const { sso_start_url, sso_account_id, sso_region, sso_role_name } = profile;
  if (!sso_start_url || !sso_account_id || !sso_region || !sso_role_name) {
    throw new CredentialsProviderError(`Profile is configured with invalid SSO credentials. Required parameters "sso_account_id", "sso_region", "sso_role_name", "sso_start_url". Got ${Object.keys(profile).join(", ")}
Reference: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html`, false);
  }
  return profile;
};
const fromSSO = (init = {}) => async () => {
  const { ssoStartUrl, ssoAccountId, ssoRegion, ssoRoleName, ssoClient, ssoSession } = init;
  const profileName = getProfileName(init);
  if (!ssoStartUrl && !ssoAccountId && !ssoRegion && !ssoRoleName && !ssoSession) {
    const profiles = await parseKnownFiles(init);
    const profile = profiles[profileName];
    if (!profile) {
      throw new CredentialsProviderError(`Profile ${profileName} was not found.`);
    }
    if (!isSsoProfile(profile)) {
      throw new CredentialsProviderError(`Profile ${profileName} is not configured with SSO credentials.`);
    }
    if (profile?.sso_session) {
      const ssoSessions = await loadSsoSessionData(init);
      const session = ssoSessions[profile.sso_session];
      const conflictMsg = ` configurations in profile ${profileName} and sso-session ${profile.sso_session}`;
      if (ssoRegion && ssoRegion !== session.sso_region) {
        throw new CredentialsProviderError(`Conflicting SSO region` + conflictMsg, false);
      }
      if (ssoStartUrl && ssoStartUrl !== session.sso_start_url) {
        throw new CredentialsProviderError(`Conflicting SSO start_url` + conflictMsg, false);
      }
      profile.sso_region = session.sso_region;
      profile.sso_start_url = session.sso_start_url;
    }
    const { sso_start_url, sso_account_id, sso_region, sso_role_name, sso_session } = validateSsoProfile(profile);
    return resolveSSOCredentials({
      ssoStartUrl: sso_start_url,
      ssoSession: sso_session,
      ssoAccountId: sso_account_id,
      ssoRegion: sso_region,
      ssoRoleName: sso_role_name,
      ssoClient,
      profile: profileName
    });
  } else if (!ssoStartUrl || !ssoAccountId || !ssoRegion || !ssoRoleName) {
    throw new CredentialsProviderError('Incomplete configuration. The fromSSO() argument hash must include "ssoStartUrl", "ssoAccountId", "ssoRegion", "ssoRoleName"');
  } else {
    return resolveSSOCredentials({
      ssoStartUrl,
      ssoSession,
      ssoAccountId,
      ssoRegion,
      ssoRoleName,
      ssoClient,
      profile: profileName
    });
  }
};
const resolveSsoCredentials = (data) => {
  const { sso_start_url, sso_account_id, sso_session, sso_region, sso_role_name } = validateSsoProfile(data);
  return fromSSO({
    ssoStartUrl: sso_start_url,
    ssoAccountId: sso_account_id,
    ssoSession: sso_session,
    ssoRegion: sso_region,
    ssoRoleName: sso_role_name
  })();
};
const isStaticCredsProfile = (arg) => Boolean(arg) && typeof arg === "object" && typeof arg.aws_access_key_id === "string" && typeof arg.aws_secret_access_key === "string" && ["undefined", "string"].indexOf(typeof arg.aws_session_token) > -1;
const resolveStaticCredentials = (profile) => Promise.resolve({
  accessKeyId: profile.aws_access_key_id,
  secretAccessKey: profile.aws_secret_access_key,
  sessionToken: profile.aws_session_token
});
const fromWebToken = (init) => () => {
  const { roleArn, roleSessionName, webIdentityToken, providerId, policyArns, policy, durationSeconds, roleAssumerWithWebIdentity } = init;
  if (!roleAssumerWithWebIdentity) {
    throw new CredentialsProviderError(`Role Arn '${roleArn}' needs to be assumed with web identity, but no role assumption callback was provided.`, false);
  }
  return roleAssumerWithWebIdentity({
    RoleArn: roleArn,
    RoleSessionName: roleSessionName ?? `aws-sdk-js-session-${Date.now()}`,
    WebIdentityToken: webIdentityToken,
    ProviderId: providerId,
    PolicyArns: policyArns,
    Policy: policy,
    DurationSeconds: durationSeconds
  });
};
const ENV_TOKEN_FILE = "AWS_WEB_IDENTITY_TOKEN_FILE";
const ENV_ROLE_ARN = "AWS_ROLE_ARN";
const ENV_ROLE_SESSION_NAME = "AWS_ROLE_SESSION_NAME";
const fromTokenFile = (init = {}) => async () => {
  return resolveTokenFile(init);
};
const resolveTokenFile = (init) => {
  const webIdentityTokenFile = init?.webIdentityTokenFile ?? process.env[ENV_TOKEN_FILE];
  const roleArn = init?.roleArn ?? process.env[ENV_ROLE_ARN];
  const roleSessionName = init?.roleSessionName ?? process.env[ENV_ROLE_SESSION_NAME];
  if (!webIdentityTokenFile || !roleArn) {
    throw new CredentialsProviderError("Web identity configuration not specified");
  }
  return fromWebToken({
    ...init,
    webIdentityToken: readFileSync(webIdentityTokenFile, { encoding: "ascii" }),
    roleArn,
    roleSessionName
  })();
};
const isWebIdentityProfile = (arg) => Boolean(arg) && typeof arg === "object" && typeof arg.web_identity_token_file === "string" && typeof arg.role_arn === "string" && ["undefined", "string"].indexOf(typeof arg.role_session_name) > -1;
const resolveWebIdentityCredentials = async (profile, options) => fromTokenFile({
  webIdentityTokenFile: profile.web_identity_token_file,
  roleArn: profile.role_arn,
  roleSessionName: profile.role_session_name,
  roleAssumerWithWebIdentity: options.roleAssumerWithWebIdentity
})();
const resolveProfileData = async (profileName, profiles, options, visitedProfiles = {}) => {
  const data = profiles[profileName];
  if (Object.keys(visitedProfiles).length > 0 && isStaticCredsProfile(data)) {
    return resolveStaticCredentials(data);
  }
  if (isAssumeRoleProfile(data)) {
    return resolveAssumeRoleCredentials(profileName, profiles, options, visitedProfiles);
  }
  if (isStaticCredsProfile(data)) {
    return resolveStaticCredentials(data);
  }
  if (isWebIdentityProfile(data)) {
    return resolveWebIdentityCredentials(data, options);
  }
  if (isProcessProfile(data)) {
    return resolveProcessCredentials(options, profileName);
  }
  if (isSsoProfile(data)) {
    return resolveSsoCredentials(data);
  }
  throw new CredentialsProviderError(`Profile ${profileName} could not be found or parsed in shared credentials file.`);
};
const fromIni = (init = {}) => async () => {
  const profiles = await parseKnownFiles(init);
  return resolveProfileData(getProfileName(init), profiles, init);
};
const ENV_IMDS_DISABLED = "AWS_EC2_METADATA_DISABLED";
const remoteProvider = (init) => {
  if (process.env[ENV_CMDS_RELATIVE_URI] || process.env[ENV_CMDS_FULL_URI]) {
    return fromContainerMetadata(init);
  }
  if (process.env[ENV_IMDS_DISABLED]) {
    return async () => {
      throw new CredentialsProviderError("EC2 Instance Metadata Service access disabled");
    };
  }
  return fromInstanceMetadata(init);
};
const defaultProvider = (init = {}) => memoize(chain(...init.profile || process.env[ENV_PROFILE] ? [] : [fromEnv$1()], fromSSO(init), fromIni(init), fromProcess(init), fromTokenFile(init), remoteProvider(init), async () => {
  throw new CredentialsProviderError("Could not load credentials from any providers", false);
}), (credentials) => credentials.expiration !== void 0 && credentials.expiration.getTime() - Date.now() < 3e5, (credentials) => credentials.expiration !== void 0);
const G = "required", H = "type", I = "fn", J = "argv", K = "ref", L = "properties", M = "headers";
const a$1 = false, b$1 = true, c$1 = "PartitionResult", d$1 = "tree", e$1 = "booleanEquals", f$1 = "stringEquals", g$1 = "sigv4", h$1 = "us-east-1", i$1 = "sts", j$1 = "endpoint", k$1 = "https://sts.{Region}.{PartitionResult#dnsSuffix}", l$1 = "error", m$1 = "getAttr", n$1 = { [G]: false, [H]: "String" }, o$1 = { [G]: true, "default": false, [H]: "Boolean" }, p$1 = { [K]: "Region" }, q$1 = { [K]: "UseFIPS" }, r$1 = { [K]: "UseDualStack" }, s$1 = { [I]: "isSet", [J]: [{ [K]: "Endpoint" }] }, t$1 = { [K]: "Endpoint" }, u$1 = { "url": "https://sts.amazonaws.com", [L]: { "authSchemes": [{ "name": g$1, "signingRegion": h$1, "signingName": i$1 }] }, [M]: {} }, v$1 = {}, w = { "conditions": [{ [I]: f$1, [J]: [p$1, "aws-global"] }], [j$1]: u$1, [H]: j$1 }, x = { [I]: e$1, [J]: [q$1, true] }, y = { [I]: e$1, [J]: [r$1, true] }, z = { [I]: e$1, [J]: [true, { [I]: m$1, [J]: [{ [K]: c$1 }, "supportsFIPS"] }] }, A = { [K]: c$1 }, B = { [I]: e$1, [J]: [true, { [I]: m$1, [J]: [A, "supportsDualStack"] }] }, C = { "url": k$1, [L]: {}, [M]: {} }, D = [t$1], E = [x], F = [y];
const _data$1 = { version: "1.0", parameters: { Region: n$1, UseDualStack: o$1, UseFIPS: o$1, Endpoint: n$1, UseGlobalEndpoint: o$1 }, rules: [{ conditions: [{ [I]: "aws.partition", [J]: [p$1], assign: c$1 }], [H]: d$1, rules: [{ conditions: [{ [I]: e$1, [J]: [{ [K]: "UseGlobalEndpoint" }, b$1] }, { [I]: e$1, [J]: [q$1, a$1] }, { [I]: e$1, [J]: [r$1, a$1] }, { [I]: "not", [J]: [s$1] }], [H]: d$1, rules: [{ conditions: [{ [I]: f$1, [J]: [p$1, "ap-northeast-1"] }], endpoint: u$1, [H]: j$1 }, { conditions: [{ [I]: f$1, [J]: [p$1, "ap-south-1"] }], endpoint: u$1, [H]: j$1 }, { conditions: [{ [I]: f$1, [J]: [p$1, "ap-southeast-1"] }], endpoint: u$1, [H]: j$1 }, { conditions: [{ [I]: f$1, [J]: [p$1, "ap-southeast-2"] }], endpoint: u$1, [H]: j$1 }, w, { conditions: [{ [I]: f$1, [J]: [p$1, "ca-central-1"] }], endpoint: u$1, [H]: j$1 }, { conditions: [{ [I]: f$1, [J]: [p$1, "eu-central-1"] }], endpoint: u$1, [H]: j$1 }, { conditions: [{ [I]: f$1, [J]: [p$1, "eu-north-1"] }], endpoint: u$1, [H]: j$1 }, { conditions: [{ [I]: f$1, [J]: [p$1, "eu-west-1"] }], endpoint: u$1, [H]: j$1 }, { conditions: [{ [I]: f$1, [J]: [p$1, "eu-west-2"] }], endpoint: u$1, [H]: j$1 }, { conditions: [{ [I]: f$1, [J]: [p$1, "eu-west-3"] }], endpoint: u$1, [H]: j$1 }, { conditions: [{ [I]: f$1, [J]: [p$1, "sa-east-1"] }], endpoint: u$1, [H]: j$1 }, { conditions: [{ [I]: f$1, [J]: [p$1, h$1] }], endpoint: u$1, [H]: j$1 }, { conditions: [{ [I]: f$1, [J]: [p$1, "us-east-2"] }], endpoint: u$1, [H]: j$1 }, { conditions: [{ [I]: f$1, [J]: [p$1, "us-west-1"] }], endpoint: u$1, [H]: j$1 }, { conditions: [{ [I]: f$1, [J]: [p$1, "us-west-2"] }], endpoint: u$1, [H]: j$1 }, { endpoint: { url: k$1, [L]: { authSchemes: [{ name: g$1, signingRegion: "{Region}", signingName: i$1 }] }, [M]: v$1 }, [H]: j$1 }] }, { conditions: [s$1, { [I]: "parseURL", [J]: D, assign: "url" }], [H]: d$1, rules: [{ conditions: E, error: "Invalid Configuration: FIPS and custom endpoint are not supported", [H]: l$1 }, { [H]: d$1, rules: [{ conditions: F, error: "Invalid Configuration: Dualstack and custom endpoint are not supported", [H]: l$1 }, { endpoint: { url: t$1, [L]: v$1, [M]: v$1 }, [H]: j$1 }] }] }, { conditions: [x, y], [H]: d$1, rules: [{ conditions: [z, B], [H]: d$1, rules: [{ endpoint: { url: "https://sts-fips.{Region}.{PartitionResult#dualStackDnsSuffix}", [L]: v$1, [M]: v$1 }, [H]: j$1 }] }, { error: "FIPS and DualStack are enabled, but this partition does not support one or both", [H]: l$1 }] }, { conditions: E, [H]: d$1, rules: [{ conditions: [z], [H]: d$1, rules: [{ [H]: d$1, rules: [{ conditions: [{ [I]: f$1, [J]: ["aws-us-gov", { [I]: m$1, [J]: [A, "name"] }] }], endpoint: C, [H]: j$1 }, { endpoint: { url: "https://sts-fips.{Region}.{PartitionResult#dnsSuffix}", [L]: v$1, [M]: v$1 }, [H]: j$1 }] }] }, { error: "FIPS is enabled but this partition does not support FIPS", [H]: l$1 }] }, { conditions: F, [H]: d$1, rules: [{ conditions: [B], [H]: d$1, rules: [{ endpoint: { url: "https://sts.{Region}.{PartitionResult#dualStackDnsSuffix}", [L]: v$1, [M]: v$1 }, [H]: j$1 }] }, { error: "DualStack is enabled but this partition does not support DualStack", [H]: l$1 }] }, { [H]: d$1, rules: [w, { endpoint: C, [H]: j$1 }] }] }] };
const ruleSet$1 = _data$1;
const defaultEndpointResolver$1 = (endpointParams, context = {}) => {
  return resolveEndpoint(ruleSet$1, {
    endpointParams,
    logger: context.logger
  });
};
const getRuntimeConfig$3 = (config) => ({
  apiVersion: "2011-06-15",
  base64Decoder: config?.base64Decoder ?? fromBase64,
  base64Encoder: config?.base64Encoder ?? toBase64,
  disableHostPrefix: config?.disableHostPrefix ?? false,
  endpointProvider: config?.endpointProvider ?? defaultEndpointResolver$1,
  logger: config?.logger ?? new NoOpLogger(),
  serviceId: config?.serviceId ?? "STS",
  urlParser: config?.urlParser ?? parseUrl,
  utf8Decoder: config?.utf8Decoder ?? fromUtf8,
  utf8Encoder: config?.utf8Encoder ?? toUtf8
});
const getRuntimeConfig$2 = (config) => {
  emitWarningIfUnsupportedVersion(process.version);
  const defaultsMode = resolveDefaultsModeConfig(config);
  const defaultConfigProvider = () => defaultsMode().then(loadConfigsForDefaultMode);
  const clientSharedValues = getRuntimeConfig$3(config);
  return {
    ...clientSharedValues,
    ...config,
    runtime: "node",
    defaultsMode,
    bodyLengthChecker: config?.bodyLengthChecker ?? calculateBodyLength,
    credentialDefaultProvider: config?.credentialDefaultProvider ?? decorateDefaultCredentialProvider$1(defaultProvider),
    defaultUserAgentProvider: config?.defaultUserAgentProvider ?? defaultUserAgent({ serviceId: clientSharedValues.serviceId, clientVersion: packageInfo$2.version }),
    maxAttempts: config?.maxAttempts ?? loadConfig(NODE_MAX_ATTEMPT_CONFIG_OPTIONS),
    region: config?.region ?? loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS),
    requestHandler: config?.requestHandler ?? new NodeHttpHandler(defaultConfigProvider),
    retryMode: config?.retryMode ?? loadConfig({
      ...NODE_RETRY_MODE_CONFIG_OPTIONS,
      default: async () => (await defaultConfigProvider()).retryMode || DEFAULT_RETRY_MODE
    }),
    sha256: config?.sha256 ?? Hash.bind(null, "sha256"),
    streamCollector: config?.streamCollector ?? streamCollector,
    useDualstackEndpoint: config?.useDualstackEndpoint ?? loadConfig(NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS),
    useFipsEndpoint: config?.useFipsEndpoint ?? loadConfig(NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS)
  };
};
class STSClient extends Client {
  constructor(configuration) {
    const _config_0 = getRuntimeConfig$2(configuration);
    const _config_1 = resolveClientEndpointParameters$2(_config_0);
    const _config_2 = resolveRegionConfig(_config_1);
    const _config_3 = resolveEndpointConfig(_config_2);
    const _config_4 = resolveRetryConfig(_config_3);
    const _config_5 = resolveHostHeaderConfig(_config_4);
    const _config_6 = resolveStsAuthConfig(_config_5, { stsClientCtor: STSClient });
    const _config_7 = resolveUserAgentConfig(_config_6);
    super(_config_7);
    this.config = _config_7;
    this.middlewareStack.use(getRetryPlugin(this.config));
    this.middlewareStack.use(getContentLengthPlugin(this.config));
    this.middlewareStack.use(getHostHeaderPlugin(this.config));
    this.middlewareStack.use(getLoggerPlugin(this.config));
    this.middlewareStack.use(getRecursionDetectionPlugin(this.config));
    this.middlewareStack.use(getUserAgentPlugin(this.config));
  }
  destroy() {
    super.destroy();
  }
}
const getCustomizableStsClientCtor = (baseCtor, customizations) => {
  if (!customizations)
    return baseCtor;
  else
    return class CustomizableSTSClient extends baseCtor {
      constructor(config) {
        super(config);
        for (const customization of customizations) {
          this.middlewareStack.use(customization);
        }
      }
    };
};
const getDefaultRoleAssumer = (stsOptions = {}, stsPlugins) => getDefaultRoleAssumer$1(stsOptions, getCustomizableStsClientCtor(STSClient, stsPlugins));
const getDefaultRoleAssumerWithWebIdentity = (stsOptions = {}, stsPlugins) => getDefaultRoleAssumerWithWebIdentity$1(stsOptions, getCustomizableStsClientCtor(STSClient, stsPlugins));
const decorateDefaultCredentialProvider = (provider) => (input) => provider({
  roleAssumer: getDefaultRoleAssumer(input),
  roleAssumerWithWebIdentity: getDefaultRoleAssumerWithWebIdentity(input),
  ...input
});
const s = "required", t = "fn", u = "argv", v = "ref";
const a = "isSet", b = "tree", c = "error", d = "endpoint", e = "PartitionResult", f = "getAttr", g = { [s]: false, "type": "String" }, h = { [s]: true, "default": false, "type": "Boolean" }, i = { [v]: "Endpoint" }, j = { [t]: "booleanEquals", [u]: [{ [v]: "UseFIPS" }, true] }, k = { [t]: "booleanEquals", [u]: [{ [v]: "UseDualStack" }, true] }, l = {}, m = { [t]: "booleanEquals", [u]: [true, { [t]: f, [u]: [{ [v]: e }, "supportsFIPS"] }] }, n = { [v]: e }, o = { [t]: "booleanEquals", [u]: [true, { [t]: f, [u]: [n, "supportsDualStack"] }] }, p = [j], q = [k], r = [{ [v]: "Region" }];
const _data = { version: "1.0", parameters: { Region: g, UseDualStack: h, UseFIPS: h, Endpoint: g }, rules: [{ conditions: [{ [t]: a, [u]: [i] }], type: b, rules: [{ conditions: p, error: "Invalid Configuration: FIPS and custom endpoint are not supported", type: c }, { type: b, rules: [{ conditions: q, error: "Invalid Configuration: Dualstack and custom endpoint are not supported", type: c }, { endpoint: { url: i, properties: l, headers: l }, type: d }] }] }, { type: b, rules: [{ conditions: [{ [t]: a, [u]: r }], type: b, rules: [{ conditions: [{ [t]: "aws.partition", [u]: r, assign: e }], type: b, rules: [{ conditions: [j, k], type: b, rules: [{ conditions: [m, o], type: b, rules: [{ type: b, rules: [{ endpoint: { url: "https://ssm-fips.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: l, headers: l }, type: d }] }] }, { error: "FIPS and DualStack are enabled, but this partition does not support one or both", type: c }] }, { conditions: p, type: b, rules: [{ conditions: [m], type: b, rules: [{ type: b, rules: [{ conditions: [{ [t]: "stringEquals", [u]: ["aws-us-gov", { [t]: f, [u]: [n, "name"] }] }], endpoint: { url: "https://ssm.{Region}.amazonaws.com", properties: l, headers: l }, type: d }, { endpoint: { url: "https://ssm-fips.{Region}.{PartitionResult#dnsSuffix}", properties: l, headers: l }, type: d }] }] }, { error: "FIPS is enabled but this partition does not support FIPS", type: c }] }, { conditions: q, type: b, rules: [{ conditions: [o], type: b, rules: [{ type: b, rules: [{ endpoint: { url: "https://ssm.{Region}.{PartitionResult#dualStackDnsSuffix}", properties: l, headers: l }, type: d }] }] }, { error: "DualStack is enabled but this partition does not support DualStack", type: c }] }, { type: b, rules: [{ endpoint: { url: "https://ssm.{Region}.{PartitionResult#dnsSuffix}", properties: l, headers: l }, type: d }] }] }] }, { error: "Invalid Configuration: Missing Region", type: c }] }] };
const ruleSet = _data;
const defaultEndpointResolver = (endpointParams, context = {}) => {
  return resolveEndpoint(ruleSet, {
    endpointParams,
    logger: context.logger
  });
};
const getRuntimeConfig$1 = (config) => ({
  apiVersion: "2014-11-06",
  base64Decoder: config?.base64Decoder ?? fromBase64,
  base64Encoder: config?.base64Encoder ?? toBase64,
  disableHostPrefix: config?.disableHostPrefix ?? false,
  endpointProvider: config?.endpointProvider ?? defaultEndpointResolver,
  logger: config?.logger ?? new NoOpLogger(),
  serviceId: config?.serviceId ?? "SSM",
  urlParser: config?.urlParser ?? parseUrl,
  utf8Decoder: config?.utf8Decoder ?? fromUtf8,
  utf8Encoder: config?.utf8Encoder ?? toUtf8
});
const getRuntimeConfig = (config) => {
  emitWarningIfUnsupportedVersion(process.version);
  const defaultsMode = resolveDefaultsModeConfig(config);
  const defaultConfigProvider = () => defaultsMode().then(loadConfigsForDefaultMode);
  const clientSharedValues = getRuntimeConfig$1(config);
  return {
    ...clientSharedValues,
    ...config,
    runtime: "node",
    defaultsMode,
    bodyLengthChecker: config?.bodyLengthChecker ?? calculateBodyLength,
    credentialDefaultProvider: config?.credentialDefaultProvider ?? decorateDefaultCredentialProvider(defaultProvider),
    defaultUserAgentProvider: config?.defaultUserAgentProvider ?? defaultUserAgent({ serviceId: clientSharedValues.serviceId, clientVersion: packageInfo$3.version }),
    maxAttempts: config?.maxAttempts ?? loadConfig(NODE_MAX_ATTEMPT_CONFIG_OPTIONS),
    region: config?.region ?? loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS),
    requestHandler: config?.requestHandler ?? new NodeHttpHandler(defaultConfigProvider),
    retryMode: config?.retryMode ?? loadConfig({
      ...NODE_RETRY_MODE_CONFIG_OPTIONS,
      default: async () => (await defaultConfigProvider()).retryMode || DEFAULT_RETRY_MODE
    }),
    sha256: config?.sha256 ?? Hash.bind(null, "sha256"),
    streamCollector: config?.streamCollector ?? streamCollector,
    useDualstackEndpoint: config?.useDualstackEndpoint ?? loadConfig(NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS),
    useFipsEndpoint: config?.useFipsEndpoint ?? loadConfig(NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS)
  };
};
class SSMClient extends Client {
  constructor(configuration) {
    const _config_0 = getRuntimeConfig(configuration);
    const _config_1 = resolveClientEndpointParameters$3(_config_0);
    const _config_2 = resolveRegionConfig(_config_1);
    const _config_3 = resolveEndpointConfig(_config_2);
    const _config_4 = resolveRetryConfig(_config_3);
    const _config_5 = resolveHostHeaderConfig(_config_4);
    const _config_6 = resolveAwsAuthConfig(_config_5);
    const _config_7 = resolveUserAgentConfig(_config_6);
    super(_config_7);
    this.config = _config_7;
    this.middlewareStack.use(getRetryPlugin(this.config));
    this.middlewareStack.use(getContentLengthPlugin(this.config));
    this.middlewareStack.use(getHostHeaderPlugin(this.config));
    this.middlewareStack.use(getLoggerPlugin(this.config));
    this.middlewareStack.use(getRecursionDetectionPlugin(this.config));
    this.middlewareStack.use(getAwsAuthPlugin(this.config));
    this.middlewareStack.use(getUserAgentPlugin(this.config));
  }
  destroy() {
    super.destroy();
  }
}
const ssm = new SSMClient({ region: process.env.SST_REGION });
let allVariables = {};
await parseEnvironment();
function createProxy(constructName) {
  const result = new Proxy({}, {
    get(target, prop) {
      if (typeof prop === "string") {
        const normProp = normalizeId(prop);
        if (!(normProp in target)) {
          throw new Error(`Cannot use ${constructName}.${String(prop)}. Please make sure it is bound to this function.`);
        }
        return Reflect.get(target, normProp);
      }
      return Reflect.get(target, prop);
    }
  });
  Object.assign(result, getVariables2(constructName));
  return result;
}
function getVariables2(constructName) {
  return allVariables[constructName] || {};
}
async function parseEnvironment() {
  const variablesFromSsm = [];
  const variablesFromSecret = [];
  Object.keys(process.env).filter((name2) => name2.startsWith("SST_")).forEach((name2) => {
    const variable = parseEnvName(name2);
    if (!variable.constructName || !variable.constructId || !variable.propName) {
      return;
    }
    const value = process.env[name2];
    if (value === "__FETCH_FROM_SSM__") {
      variablesFromSsm.push(variable);
    } else if (value.startsWith("__FETCH_FROM_SECRET__:")) {
      variablesFromSecret.push([variable, value.split(":")[1]]);
    } else {
      storeVariable(variable, value);
    }
  });
  await fetchValuesFromSSM(variablesFromSsm);
  variablesFromSecret.forEach(([variable, secretName]) => {
    const value = allVariables["Secret"]?.[secretName]?.value;
    if (value) {
      storeVariable(variable, value);
    }
  });
  return allVariables;
}
async function fetchValuesFromSSM(variablesFromSsm) {
  const ssmPaths = variablesFromSsm.map((variable) => buildSsmPath(variable));
  if (ssmPaths.length === 0)
    return;
  const results = await loadSecrets(ssmPaths);
  results.validParams.forEach((item) => {
    const variable = parseSsmPath(item.Name);
    storeVariable(variable, item.Value);
  });
  const ssmFallbackPaths = results.invalidParams.map((name2) => parseSsmPath(name2)).filter((variable) => variable.constructName === "Secret").map((variable) => buildSsmFallbackPath(variable));
  if (ssmFallbackPaths.length === 0)
    return;
  const fallbackResults = await loadSecrets(ssmFallbackPaths);
  fallbackResults.validParams.forEach((item) => {
    const variable = parseSsmFallbackPath(item.Name);
    storeVariable(variable, item.Value);
  });
  const missingSecrets = fallbackResults.invalidParams.map((name2) => parseSsmFallbackPath(name2)).filter((variable) => variable.constructName === "Secret").map((variable) => variable.constructId);
  if (missingSecrets.length > 0) {
    throw new Error(`The following secrets were not found: ${missingSecrets.join(", ")}`);
  }
}
async function loadSecrets(paths) {
  const chunks = [];
  for (let i2 = 0; i2 < paths.length; i2 += 10) {
    chunks.push(paths.slice(i2, i2 + 10));
  }
  const validParams = [];
  const invalidParams = [];
  await Promise.all(chunks.map(async (chunk) => {
    const command = new GetParametersCommand({
      Names: chunk,
      WithDecryption: true
    });
    const result = await ssm.send(command);
    validParams.push(...result.Parameters || []);
    invalidParams.push(...result.InvalidParameters || []);
  }));
  return { validParams, invalidParams };
}
function parseEnvName(env2) {
  const [_SST, constructName, propName2, ...idParts] = env2.split("_");
  return {
    constructName,
    constructId: idParts.join("_"),
    propName: propName2
  };
}
function parseSsmPath(path) {
  const prefix = ssmPrefix();
  const parts = path.substring(prefix.length).split("/");
  return {
    constructName: parts[0],
    constructId: parts[1],
    propName: parts[2]
  };
}
function parseSsmFallbackPath(path) {
  const parts = path.split("/");
  return {
    constructName: parts[4],
    constructId: parts[5],
    propName: parts[6]
  };
}
function buildSsmPath(data) {
  return `${ssmPrefix()}${data.constructName}/${data.constructId}/${data.propName}`;
}
function buildSsmFallbackPath(data) {
  return `/sst/${process.env.SST_APP}/.fallback/${data.constructName}/${data.constructId}/${data.propName}`;
}
function normalizeId(name2) {
  return name2.replace(/-/g, "_");
}
function ssmPrefix() {
  return process.env.SST_SSM_PREFIX || "";
}
function storeVariable(variable, value) {
  const { constructId: id, constructName: c2, propName: prop } = variable;
  allVariables[c2] = allVariables[c2] || {};
  allVariables[c2][id] = allVariables[c2][id] || {};
  allVariables[c2][id][prop] = value;
}
const Config = /* @__PURE__ */ createProxy("Config");
const metadata = parseMetadataEnvironment();
const parameters = flattenValues(getVariables2("Parameter"));
const secrets = flattenValues(getVariables2("Secret"));
Object.assign(Config, metadata, parameters, secrets);
function parseMetadataEnvironment() {
  return {
    APP: process.env.SST_APP,
    STAGE: process.env.SST_STAGE
  };
}
function flattenValues(configValues) {
  const acc = {};
  Object.keys(configValues).forEach((name2) => {
    acc[name2] = configValues[name2].value;
  });
  return acc;
}
const Function$1 = /* @__PURE__ */ createProxy("Function");
const load = ({}) => {
  return {
    env: { FUNCTION_NAME },
    bind: {
      stripeKey: Config.STRIPE_KEY,
      functionName: Function$1.ConfigFunction.functionName
    }
  };
};
export {
  load
};
