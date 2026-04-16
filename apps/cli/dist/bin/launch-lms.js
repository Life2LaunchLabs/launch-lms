#!/usr/bin/env node
import { createRequire as __createRequire } from "module";
const require = __createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/commander/lib/error.js
var require_error = __commonJS({
  "node_modules/commander/lib/error.js"(exports) {
    "use strict";
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
  }
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "node_modules/commander/lib/argument.js"(exports) {
    "use strict";
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.endsWith("...")) {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _collectValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        previous.push(value);
        return previous;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._collectValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports.Argument = Argument2;
    exports.humanReadableArgName = humanReadableArgName;
  }
});

// node_modules/commander/lib/help.js
var require_help = __commonJS({
  "node_modules/commander/lib/help.js"(exports) {
    "use strict";
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.minWidthToWrap = 40;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * prepareContext is called by Commander after applying overrides from `Command.configureHelp()`
       * and just before calling `formatHelp()`.
       *
       * Commander just uses the helpWidth and the rest is provided for optional use by more complex subclasses.
       *
       * @param {{ error?: boolean, helpWidth?: number, outputHasColors?: boolean }} contextOptions
       */
      prepareContext(contextOptions) {
        this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(
            max,
            this.displayWidth(
              helper.styleSubcommandTerm(helper.subcommandTerm(command))
            )
          );
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(
            max,
            this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
          );
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(
            max,
            this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
          );
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(
            max,
            this.displayWidth(
              helper.styleArgumentTerm(helper.argumentTerm(argument))
            )
          );
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          const extraDescription = `(${extraInfo.join(", ")})`;
          if (option.description) {
            return `${option.description} ${extraDescription}`;
          }
          return extraDescription;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescription = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescription}`;
          }
          return extraDescription;
        }
        return argument.description;
      }
      /**
       * Format a list of items, given a heading and an array of formatted items.
       *
       * @param {string} heading
       * @param {string[]} items
       * @param {Help} helper
       * @returns string[]
       */
      formatItemList(heading, items, helper) {
        if (items.length === 0) return [];
        return [helper.styleTitle(heading), ...items, ""];
      }
      /**
       * Group items by their help group heading.
       *
       * @param {Command[] | Option[]} unsortedItems
       * @param {Command[] | Option[]} visibleItems
       * @param {Function} getGroup
       * @returns {Map<string, Command[] | Option[]>}
       */
      groupItems(unsortedItems, visibleItems, getGroup) {
        const result = /* @__PURE__ */ new Map();
        unsortedItems.forEach((item) => {
          const group = getGroup(item);
          if (!result.has(group)) result.set(group, []);
        });
        visibleItems.forEach((item) => {
          const group = getGroup(item);
          if (!result.has(group)) {
            result.set(group, []);
          }
          result.get(group).push(item);
        });
        return result;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth ?? 80;
        function callFormatItem(term, description) {
          return helper.formatItem(term, termWidth, description, helper);
        }
        let output = [
          `${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(cmd))}`,
          ""
        ];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([
            helper.boxWrap(
              helper.styleCommandDescription(commandDescription),
              helpWidth
            ),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return callFormatItem(
            helper.styleArgumentTerm(helper.argumentTerm(argument)),
            helper.styleArgumentDescription(helper.argumentDescription(argument))
          );
        });
        output = output.concat(
          this.formatItemList("Arguments:", argumentList, helper)
        );
        const optionGroups = this.groupItems(
          cmd.options,
          helper.visibleOptions(cmd),
          (option) => option.helpGroupHeading ?? "Options:"
        );
        optionGroups.forEach((options, group) => {
          const optionList = options.map((option) => {
            return callFormatItem(
              helper.styleOptionTerm(helper.optionTerm(option)),
              helper.styleOptionDescription(helper.optionDescription(option))
            );
          });
          output = output.concat(this.formatItemList(group, optionList, helper));
        });
        if (helper.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return callFormatItem(
              helper.styleOptionTerm(helper.optionTerm(option)),
              helper.styleOptionDescription(helper.optionDescription(option))
            );
          });
          output = output.concat(
            this.formatItemList("Global Options:", globalOptionList, helper)
          );
        }
        const commandGroups = this.groupItems(
          cmd.commands,
          helper.visibleCommands(cmd),
          (sub) => sub.helpGroup() || "Commands:"
        );
        commandGroups.forEach((commands, group) => {
          const commandList = commands.map((sub) => {
            return callFormatItem(
              helper.styleSubcommandTerm(helper.subcommandTerm(sub)),
              helper.styleSubcommandDescription(helper.subcommandDescription(sub))
            );
          });
          output = output.concat(this.formatItemList(group, commandList, helper));
        });
        return output.join("\n");
      }
      /**
       * Return display width of string, ignoring ANSI escape sequences. Used in padding and wrapping calculations.
       *
       * @param {string} str
       * @returns {number}
       */
      displayWidth(str) {
        return stripColor(str).length;
      }
      /**
       * Style the title for displaying in the help. Called with 'Usage:', 'Options:', etc.
       *
       * @param {string} str
       * @returns {string}
       */
      styleTitle(str) {
        return str;
      }
      styleUsage(str) {
        return str.split(" ").map((word) => {
          if (word === "[options]") return this.styleOptionText(word);
          if (word === "[command]") return this.styleSubcommandText(word);
          if (word[0] === "[" || word[0] === "<")
            return this.styleArgumentText(word);
          return this.styleCommandText(word);
        }).join(" ");
      }
      styleCommandDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleOptionDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleSubcommandDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleArgumentDescription(str) {
        return this.styleDescriptionText(str);
      }
      styleDescriptionText(str) {
        return str;
      }
      styleOptionTerm(str) {
        return this.styleOptionText(str);
      }
      styleSubcommandTerm(str) {
        return str.split(" ").map((word) => {
          if (word === "[options]") return this.styleOptionText(word);
          if (word[0] === "[" || word[0] === "<")
            return this.styleArgumentText(word);
          return this.styleSubcommandText(word);
        }).join(" ");
      }
      styleArgumentTerm(str) {
        return this.styleArgumentText(str);
      }
      styleOptionText(str) {
        return str;
      }
      styleArgumentText(str) {
        return str;
      }
      styleSubcommandText(str) {
        return str;
      }
      styleCommandText(str) {
        return str;
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Detect manually wrapped and indented strings by checking for line break followed by whitespace.
       *
       * @param {string} str
       * @returns {boolean}
       */
      preformatted(str) {
        return /\n[^\S\r\n]/.test(str);
      }
      /**
       * Format the "item", which consists of a term and description. Pad the term and wrap the description, indenting the following lines.
       *
       * So "TTT", 5, "DDD DDDD DD DDD" might be formatted for this.helpWidth=17 like so:
       *   TTT  DDD DDDD
       *        DD DDD
       *
       * @param {string} term
       * @param {number} termWidth
       * @param {string} description
       * @param {Help} helper
       * @returns {string}
       */
      formatItem(term, termWidth, description, helper) {
        const itemIndent = 2;
        const itemIndentStr = " ".repeat(itemIndent);
        if (!description) return itemIndentStr + term;
        const paddedTerm = term.padEnd(
          termWidth + term.length - helper.displayWidth(term)
        );
        const spacerWidth = 2;
        const helpWidth = this.helpWidth ?? 80;
        const remainingWidth = helpWidth - termWidth - spacerWidth - itemIndent;
        let formattedDescription;
        if (remainingWidth < this.minWidthToWrap || helper.preformatted(description)) {
          formattedDescription = description;
        } else {
          const wrappedDescription = helper.boxWrap(description, remainingWidth);
          formattedDescription = wrappedDescription.replace(
            /\n/g,
            "\n" + " ".repeat(termWidth + spacerWidth)
          );
        }
        return itemIndentStr + paddedTerm + " ".repeat(spacerWidth) + formattedDescription.replace(/\n/g, `
${itemIndentStr}`);
      }
      /**
       * Wrap a string at whitespace, preserving existing line breaks.
       * Wrapping is skipped if the width is less than `minWidthToWrap`.
       *
       * @param {string} str
       * @param {number} width
       * @returns {string}
       */
      boxWrap(str, width) {
        if (width < this.minWidthToWrap) return str;
        const rawLines = str.split(/\r\n|\n/);
        const chunkPattern = /[\s]*[^\s]+/g;
        const wrappedLines = [];
        rawLines.forEach((line) => {
          const chunks = line.match(chunkPattern);
          if (chunks === null) {
            wrappedLines.push("");
            return;
          }
          let sumChunks = [chunks.shift()];
          let sumWidth = this.displayWidth(sumChunks[0]);
          chunks.forEach((chunk) => {
            const visibleWidth = this.displayWidth(chunk);
            if (sumWidth + visibleWidth <= width) {
              sumChunks.push(chunk);
              sumWidth += visibleWidth;
              return;
            }
            wrappedLines.push(sumChunks.join(""));
            const nextChunk = chunk.trimStart();
            sumChunks = [nextChunk];
            sumWidth = this.displayWidth(nextChunk);
          });
          wrappedLines.push(sumChunks.join(""));
        });
        return wrappedLines.join("\n");
      }
    };
    function stripColor(str) {
      const sgrPattern = /\x1b\[\d*(;\d*)*m/g;
      return str.replace(sgrPattern, "");
    }
    exports.Help = Help2;
    exports.stripColor = stripColor;
  }
});

// node_modules/commander/lib/option.js
var require_option = __commonJS({
  "node_modules/commander/lib/option.js"(exports) {
    "use strict";
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
        this.helpGroupHeading = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _collectValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        previous.push(value);
        return previous;
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._collectValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as an object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        if (this.negate) {
          return camelcase(this.name().replace(/^no-/, ""));
        }
        return camelcase(this.name());
      }
      /**
       * Set the help group heading.
       *
       * @param {string} heading
       * @return {Option}
       */
      helpGroup(heading) {
        this.helpGroupHeading = heading;
        return this;
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const shortFlagExp = /^-[^-]$/;
      const longFlagExp = /^--[^-]/;
      const flagParts = flags.split(/[ |,]+/).concat("guard");
      if (shortFlagExp.test(flagParts[0])) shortFlag = flagParts.shift();
      if (longFlagExp.test(flagParts[0])) longFlag = flagParts.shift();
      if (!shortFlag && shortFlagExp.test(flagParts[0]))
        shortFlag = flagParts.shift();
      if (!shortFlag && longFlagExp.test(flagParts[0])) {
        shortFlag = longFlag;
        longFlag = flagParts.shift();
      }
      if (flagParts[0].startsWith("-")) {
        const unsupportedFlag = flagParts[0];
        const baseError = `option creation failed due to '${unsupportedFlag}' in option flags '${flags}'`;
        if (/^-[^-][^-]/.test(unsupportedFlag))
          throw new Error(
            `${baseError}
- a short flag is a single dash and a single character
  - either use a single dash and a single character (for a short flag)
  - or use a double dash for a long option (and can have two, like '--ws, --workspace')`
          );
        if (shortFlagExp.test(unsupportedFlag))
          throw new Error(`${baseError}
- too many short flags`);
        if (longFlagExp.test(unsupportedFlag))
          throw new Error(`${baseError}
- too many long flags`);
        throw new Error(`${baseError}
- unrecognised flag format`);
      }
      if (shortFlag === void 0 && longFlag === void 0)
        throw new Error(
          `option creation failed due to no flags found in '${flags}'.`
        );
      return { shortFlag, longFlag };
    }
    exports.Option = Option2;
    exports.DualOptions = DualOptions;
  }
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "node_modules/commander/lib/suggestSimilar.js"(exports) {
    "use strict";
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d3 = [];
      for (let i = 0; i <= a.length; i++) {
        d3[i] = [i];
      }
      for (let j2 = 0; j2 <= b.length; j2++) {
        d3[0][j2] = j2;
      }
      for (let j2 = 1; j2 <= b.length; j2++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j2 - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d3[i][j2] = Math.min(
            d3[i - 1][j2] + 1,
            // deletion
            d3[i][j2 - 1] + 1,
            // insertion
            d3[i - 1][j2 - 1] + cost
            // substitution
          );
          if (i > 1 && j2 > 1 && a[i - 1] === b[j2 - 2] && a[i - 2] === b[j2 - 1]) {
            d3[i][j2] = Math.min(d3[i][j2], d3[i - 2][j2 - 2] + 1);
          }
        }
      }
      return d3[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports.suggestSimilar = suggestSimilar;
  }
});

// node_modules/commander/lib/command.js
var require_command = __commonJS({
  "node_modules/commander/lib/command.js"(exports) {
    "use strict";
    var EventEmitter = __require("events").EventEmitter;
    var childProcess = __require("child_process");
    var path9 = __require("path");
    var fs9 = __require("fs");
    var process2 = __require("process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2, stripColor } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = false;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._savedState = null;
        this._outputConfiguration = {
          writeOut: (str) => process2.stdout.write(str),
          writeErr: (str) => process2.stderr.write(str),
          outputError: (str, write) => write(str),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          getOutHasColors: () => useColor() ?? (process2.stdout.isTTY && process2.stdout.hasColors?.()),
          getErrHasColors: () => useColor() ?? (process2.stderr.isTTY && process2.stderr.hasColors?.()),
          stripColor: (str) => stripColor(str)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
        this._helpGroupHeading = void 0;
        this._defaultCommandGroup = void 0;
        this._defaultOptionGroup = void 0;
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // change how output being written, defaults to stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // change how output being written for errors, defaults to writeErr
       *     outputError(str, write) // used for displaying errors and not used for displaying help
       *     // specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // color support, currently only used with Help
       *     getOutHasColors()
       *     getErrHasColors()
       *     stripColor() // used to remove ANSI escape codes if output does not have colors
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        this._outputConfiguration = {
          ...this._outputConfiguration,
          ...configuration
        };
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom argument processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, parseArg, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof parseArg === "function") {
          argument.default(defaultValue).argParser(parseArg);
        } else {
          argument.default(parseArg);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument?.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          if (enableOrNameAndArgs && this._defaultCommandGroup) {
            this._initCommandGroup(this._getHelpCommand());
          }
          return this;
        }
        const nameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        if (enableOrNameAndArgs || description) this._initCommandGroup(helpCommand);
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        this._initCommandGroup(helpCommand);
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this._initOptionGroup(option);
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name) => this._findCommand(name)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this._initCommandGroup(command);
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._collectValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('--pt, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process2.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process2.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process2.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      _prepareForParse() {
        if (this._savedState === null) {
          this.saveStateBeforeParse();
        } else {
          this.restoreStateBeforeParse();
        }
      }
      /**
       * Called the first time parse is called to save state and allow a restore before subsequent calls to parse.
       * Not usually called directly, but available for subclasses to save their custom state.
       *
       * This is called in a lazy way. Only commands used in parsing chain will have state saved.
       */
      saveStateBeforeParse() {
        this._savedState = {
          // name is stable if supplied by author, but may be unspecified for root command and deduced during parsing
          _name: this._name,
          // option values before parse have default values (including false for negated options)
          // shallow clones
          _optionValues: { ...this._optionValues },
          _optionValueSources: { ...this._optionValueSources }
        };
      }
      /**
       * Restore state before parse for calls after the first.
       * Not usually called directly, but available for subclasses to save their custom state.
       *
       * This is called in a lazy way. Only commands used in parsing chain will have state restored.
       */
      restoreStateBeforeParse() {
        if (this._storeOptionsAsProperties)
          throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
        this._name = this._savedState._name;
        this._scriptPath = null;
        this.rawArgs = [];
        this._optionValues = { ...this._savedState._optionValues };
        this._optionValueSources = { ...this._savedState._optionValueSources };
        this.args = [];
        this.processedArgs = [];
      }
      /**
       * Throw if expected executable is missing. Add lots of help for author.
       *
       * @param {string} executableFile
       * @param {string} executableDir
       * @param {string} subcommandName
       */
      _checkForMissingExecutable(executableFile, executableDir, subcommandName) {
        if (fs9.existsSync(executableFile)) return;
        const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
        const executableMissing = `'${executableFile}' does not exist
 - if '${subcommandName}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
        throw new Error(executableMissing);
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path9.resolve(baseDir, baseName);
          if (fs9.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path9.extname(baseName))) return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs9.existsSync(`${localBin}${ext}`)
          );
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs9.realpathSync(this._scriptPath);
          } catch {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path9.resolve(
            path9.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path9.basename(
              this._scriptPath,
              path9.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path9.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          this._checkForMissingExecutable(
            executableFile,
            executableDir,
            subcommand._name
          );
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process2.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            this._checkForMissingExecutable(
              executableFile,
              executableDir,
              subcommand._name
            );
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        subCommand._prepareForParse();
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn) {
        if (promise?.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent?.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Side effects: modifies command by storing options. Does not reset state if called again.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} args
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(args) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        const negativeNumberArg = (arg) => {
          if (!/^-(\d+|\d*\.\d+)(e[+-]?\d+)?$/.test(arg)) return false;
          return !this._getCommandAndAncestors().some(
            (cmd) => cmd.options.map((opt) => opt.short).some((short) => /^-\d$/.test(short))
          );
        };
        let activeVariadicOption = null;
        let activeGroup = null;
        let i = 0;
        while (i < args.length || activeGroup) {
          const arg = activeGroup ?? args[i++];
          activeGroup = null;
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args.slice(i));
            break;
          }
          if (activeVariadicOption && (!maybeOption(arg) || negativeNumberArg(arg))) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args[i++];
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (i < args.length && (!maybeOption(args[i]) || negativeNumberArg(args[i]))) {
                  value = args[i++];
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                activeGroup = `-${arg.slice(2)}`;
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (dest === operands && maybeOption(arg) && !(this.commands.length === 0 && negativeNumberArg(arg))) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              unknown.push(...args.slice(i));
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg, ...args.slice(i));
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg, ...args.slice(i));
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg, ...args.slice(i));
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0) return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str) {
        if (str === void 0) return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str) {
        if (str === void 0) return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set/get the help group heading for this subcommand in parent command's help.
       *
       * @param {string} [heading]
       * @return {Command | string}
       */
      helpGroup(heading) {
        if (heading === void 0) return this._helpGroupHeading ?? "";
        this._helpGroupHeading = heading;
        return this;
      }
      /**
       * Set/get the default help group heading for subcommands added to this command.
       * (This does not override a group set directly on the subcommand using .helpGroup().)
       *
       * @example
       * program.commandsGroup('Development Commands:);
       * program.command('watch')...
       * program.command('lint')...
       * ...
       *
       * @param {string} [heading]
       * @returns {Command | string}
       */
      commandsGroup(heading) {
        if (heading === void 0) return this._defaultCommandGroup ?? "";
        this._defaultCommandGroup = heading;
        return this;
      }
      /**
       * Set/get the default help group heading for options added to this command.
       * (This does not override a group set directly on the option using .helpGroup().)
       *
       * @example
       * program
       *   .optionsGroup('Development Options:')
       *   .option('-d, --debug', 'output extra debugging')
       *   .option('-p, --profile', 'output profiling information')
       *
       * @param {string} [heading]
       * @returns {Command | string}
       */
      optionsGroup(heading) {
        if (heading === void 0) return this._defaultOptionGroup ?? "";
        this._defaultOptionGroup = heading;
        return this;
      }
      /**
       * @param {Option} option
       * @private
       */
      _initOptionGroup(option) {
        if (this._defaultOptionGroup && !option.helpGroupHeading)
          option.helpGroup(this._defaultOptionGroup);
      }
      /**
       * @param {Command} cmd
       * @private
       */
      _initCommandGroup(cmd) {
        if (this._defaultCommandGroup && !cmd.helpGroup())
          cmd.helpGroup(this._defaultCommandGroup);
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path9.basename(filename, path9.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path10) {
        if (path10 === void 0) return this._executableDir;
        this._executableDir = path10;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        const context = this._getOutputContext(contextOptions);
        helper.prepareContext({
          error: context.error,
          helpWidth: context.helpWidth,
          outputHasColors: context.hasColors
        });
        const text2 = helper.formatHelp(this, helper);
        if (context.hasColors) return text2;
        return this._outputConfiguration.stripColor(text2);
      }
      /**
       * @typedef HelpContext
       * @type {object}
       * @property {boolean} error
       * @property {number} helpWidth
       * @property {boolean} hasColors
       * @property {function} write - includes stripColor if needed
       *
       * @returns {HelpContext}
       * @private
       */
      _getOutputContext(contextOptions) {
        contextOptions = contextOptions || {};
        const error = !!contextOptions.error;
        let baseWrite;
        let hasColors;
        let helpWidth;
        if (error) {
          baseWrite = (str) => this._outputConfiguration.writeErr(str);
          hasColors = this._outputConfiguration.getErrHasColors();
          helpWidth = this._outputConfiguration.getErrHelpWidth();
        } else {
          baseWrite = (str) => this._outputConfiguration.writeOut(str);
          hasColors = this._outputConfiguration.getOutHasColors();
          helpWidth = this._outputConfiguration.getOutHelpWidth();
        }
        const write = (str) => {
          if (!hasColors) str = this._outputConfiguration.stripColor(str);
          return baseWrite(str);
        };
        return { error, write, hasColors, helpWidth };
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const outputContext = this._getOutputContext(contextOptions);
        const eventContext = {
          error: outputContext.error,
          write: outputContext.write,
          command: this
        };
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", eventContext));
        this.emit("beforeHelp", eventContext);
        let helpInformation = this.helpInformation({ error: outputContext.error });
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        outputContext.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", eventContext);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", eventContext)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            if (this._helpOption === null) this._helpOption = void 0;
            if (this._defaultOptionGroup) {
              this._initOptionGroup(this._getHelpOption());
            }
          } else {
            this._helpOption = null;
          }
          return this;
        }
        this._helpOption = this.createOption(
          flags ?? "-h, --help",
          description ?? "display help for command"
        );
        if (flags || description) this._initOptionGroup(this._helpOption);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        this._initOptionGroup(option);
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = Number(process2.exitCode ?? 0);
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * // Do a little typing to coordinate emit and listener for the help text events.
       * @typedef HelpTextEventContext
       * @type {object}
       * @property {boolean} error
       * @property {Command} command
       * @property {function} write
       */
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text2) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text2 === "function") {
            helpStr = text2({ error: context.error, command: context.command });
          } else {
            helpStr = text2;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    function useColor() {
      if (process2.env.NO_COLOR || process2.env.FORCE_COLOR === "0" || process2.env.FORCE_COLOR === "false")
        return false;
      if (process2.env.FORCE_COLOR || process2.env.CLICOLOR_FORCE !== void 0)
        return true;
      return void 0;
    }
    exports.Command = Command2;
    exports.useColor = useColor;
  }
});

// node_modules/commander/index.js
var require_commander = __commonJS({
  "node_modules/commander/index.js"(exports) {
    "use strict";
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports.program = new Command2();
    exports.createCommand = (name) => new Command2(name);
    exports.createOption = (flags, description) => new Option2(flags, description);
    exports.createArgument = (name, description) => new Argument2(name, description);
    exports.Command = Command2;
    exports.Option = Option2;
    exports.Argument = Argument2;
    exports.Help = Help2;
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
    exports.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// node_modules/picocolors/picocolors.js
var require_picocolors = __commonJS({
  "node_modules/picocolors/picocolors.js"(exports, module) {
    "use strict";
    var p2 = process || {};
    var argv = p2.argv || [];
    var env = p2.env || {};
    var isColorSupported = !(!!env.NO_COLOR || argv.includes("--no-color")) && (!!env.FORCE_COLOR || argv.includes("--color") || p2.platform === "win32" || (p2.stdout || {}).isTTY && env.TERM !== "dumb" || !!env.CI);
    var formatter = (open, close, replace = open) => (input) => {
      let string = "" + input, index = string.indexOf(close, open.length);
      return ~index ? open + replaceClose(string, close, replace, index) + close : open + string + close;
    };
    var replaceClose = (string, close, replace, index) => {
      let result = "", cursor = 0;
      do {
        result += string.substring(cursor, index) + replace;
        cursor = index + close.length;
        index = string.indexOf(close, cursor);
      } while (~index);
      return result + string.substring(cursor);
    };
    var createColors = (enabled = isColorSupported) => {
      let f = enabled ? formatter : () => String;
      return {
        isColorSupported: enabled,
        reset: f("\x1B[0m", "\x1B[0m"),
        bold: f("\x1B[1m", "\x1B[22m", "\x1B[22m\x1B[1m"),
        dim: f("\x1B[2m", "\x1B[22m", "\x1B[22m\x1B[2m"),
        italic: f("\x1B[3m", "\x1B[23m"),
        underline: f("\x1B[4m", "\x1B[24m"),
        inverse: f("\x1B[7m", "\x1B[27m"),
        hidden: f("\x1B[8m", "\x1B[28m"),
        strikethrough: f("\x1B[9m", "\x1B[29m"),
        black: f("\x1B[30m", "\x1B[39m"),
        red: f("\x1B[31m", "\x1B[39m"),
        green: f("\x1B[32m", "\x1B[39m"),
        yellow: f("\x1B[33m", "\x1B[39m"),
        blue: f("\x1B[34m", "\x1B[39m"),
        magenta: f("\x1B[35m", "\x1B[39m"),
        cyan: f("\x1B[36m", "\x1B[39m"),
        white: f("\x1B[37m", "\x1B[39m"),
        gray: f("\x1B[90m", "\x1B[39m"),
        bgBlack: f("\x1B[40m", "\x1B[49m"),
        bgRed: f("\x1B[41m", "\x1B[49m"),
        bgGreen: f("\x1B[42m", "\x1B[49m"),
        bgYellow: f("\x1B[43m", "\x1B[49m"),
        bgBlue: f("\x1B[44m", "\x1B[49m"),
        bgMagenta: f("\x1B[45m", "\x1B[49m"),
        bgCyan: f("\x1B[46m", "\x1B[49m"),
        bgWhite: f("\x1B[47m", "\x1B[49m"),
        blackBright: f("\x1B[90m", "\x1B[39m"),
        redBright: f("\x1B[91m", "\x1B[39m"),
        greenBright: f("\x1B[92m", "\x1B[39m"),
        yellowBright: f("\x1B[93m", "\x1B[39m"),
        blueBright: f("\x1B[94m", "\x1B[39m"),
        magentaBright: f("\x1B[95m", "\x1B[39m"),
        cyanBright: f("\x1B[96m", "\x1B[39m"),
        whiteBright: f("\x1B[97m", "\x1B[39m"),
        bgBlackBright: f("\x1B[100m", "\x1B[49m"),
        bgRedBright: f("\x1B[101m", "\x1B[49m"),
        bgGreenBright: f("\x1B[102m", "\x1B[49m"),
        bgYellowBright: f("\x1B[103m", "\x1B[49m"),
        bgBlueBright: f("\x1B[104m", "\x1B[49m"),
        bgMagentaBright: f("\x1B[105m", "\x1B[49m"),
        bgCyanBright: f("\x1B[106m", "\x1B[49m"),
        bgWhiteBright: f("\x1B[107m", "\x1B[49m")
      };
    };
    module.exports = createColors();
    module.exports.createColors = createColors;
  }
});

// node_modules/sisteransi/src/index.js
var require_src = __commonJS({
  "node_modules/sisteransi/src/index.js"(exports, module) {
    "use strict";
    var ESC2 = "\x1B";
    var CSI2 = `${ESC2}[`;
    var beep = "\x07";
    var cursor = {
      to(x, y2) {
        if (!y2) return `${CSI2}${x + 1}G`;
        return `${CSI2}${y2 + 1};${x + 1}H`;
      },
      move(x, y2) {
        let ret = "";
        if (x < 0) ret += `${CSI2}${-x}D`;
        else if (x > 0) ret += `${CSI2}${x}C`;
        if (y2 < 0) ret += `${CSI2}${-y2}A`;
        else if (y2 > 0) ret += `${CSI2}${y2}B`;
        return ret;
      },
      up: (count = 1) => `${CSI2}${count}A`,
      down: (count = 1) => `${CSI2}${count}B`,
      forward: (count = 1) => `${CSI2}${count}C`,
      backward: (count = 1) => `${CSI2}${count}D`,
      nextLine: (count = 1) => `${CSI2}E`.repeat(count),
      prevLine: (count = 1) => `${CSI2}F`.repeat(count),
      left: `${CSI2}G`,
      hide: `${CSI2}?25l`,
      show: `${CSI2}?25h`,
      save: `${ESC2}7`,
      restore: `${ESC2}8`
    };
    var scroll = {
      up: (count = 1) => `${CSI2}S`.repeat(count),
      down: (count = 1) => `${CSI2}T`.repeat(count)
    };
    var erase = {
      screen: `${CSI2}2J`,
      up: (count = 1) => `${CSI2}1J`.repeat(count),
      down: (count = 1) => `${CSI2}J`.repeat(count),
      line: `${CSI2}2K`,
      lineEnd: `${CSI2}K`,
      lineStart: `${CSI2}1K`,
      lines(count) {
        let clear = "";
        for (let i = 0; i < count; i++)
          clear += this.line + (i < count - 1 ? cursor.up() : "");
        if (count)
          clear += cursor.left;
        return clear;
      }
    };
    module.exports = { cursor, scroll, erase, beep };
  }
});

// node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// bin/launch-lms.ts
var import_picocolors17 = __toESM(require_picocolors(), 1);

// src/constants.ts
var VERSION = "1.2.0";
var LOCAL_CLI_COMMAND = "./launch-lms";
var APP_IMAGE = "ghcr.io/life2launchlabs/launch-lms:latest";
var DEV_IMAGE = "ghcr.io/life2launchlabs/launch-lms:dev";
var POSTGRES_IMAGE = "postgres:16-alpine";
var POSTGRES_AI_IMAGE = "pgvector/pgvector:pg16";
var HEALTH_CHECK_TIMEOUT_MS = 18e4;
var HEALTH_CHECK_INTERVAL_MS = 3e3;
var CONFIG_FILENAME = "launch-lms.config.json";

// src/ui/banner.ts
var import_picocolors = __toESM(require_picocolors(), 1);
var ICON = [
  "          \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588          ",
  "         \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588         ",
  "         \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588         ",
  "       \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588       ",
  "     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588     ",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588    \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588      \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588          \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588              \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588                  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588                        \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588"
];
var ICON_W = Math.max(...ICON.map((l) => l.length));
function center(s, width) {
  const pad = Math.max(0, width - s.length);
  return " ".repeat(Math.floor(pad / 2)) + s;
}
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
function padStyled(styled, width) {
  const visible = stripAnsi(styled).length;
  return styled + " ".repeat(Math.max(0, width - visible));
}
var BOX_W = 44;
function boxLine(content) {
  return import_picocolors.default.dim("\u2502") + " " + padStyled(content, BOX_W) + " " + import_picocolors.default.dim("\u2502");
}
function buildInfoBox() {
  const top = import_picocolors.default.dim("\u250C" + "\u2500".repeat(BOX_W + 2) + "\u2510");
  const bot = import_picocolors.default.dim("\u2514" + "\u2500".repeat(BOX_W + 2) + "\u2518");
  const sep = import_picocolors.default.dim("\u2500".repeat(BOX_W));
  const empty = boxLine("");
  return [
    top,
    boxLine(import_picocolors.default.bold(import_picocolors.default.white("Launch LMS")) + import_picocolors.default.dim(` // v${VERSION}`)),
    boxLine(sep),
    boxLine(import_picocolors.default.white("Deploy Launch LMS with a single command.")),
    boxLine(import_picocolors.default.white("Handles configuration, Docker, SSL, DB.")),
    empty,
    boxLine(import_picocolors.default.white("> ") + import_picocolors.default.dim("launch-lms")),
    bot
  ];
}
async function printBanner() {
  console.log();
  for (const line of ICON) {
    console.log(import_picocolors.default.white(center(line, ICON_W)));
  }
  console.log();
  const box = buildInfoBox();
  for (const line of box) {
    const visible = stripAnsi(line).length;
    const pad = Math.max(0, Math.floor((ICON_W - visible) / 2));
    console.log(" ".repeat(pad) + line);
  }
  console.log();
}

// src/services/version-check.ts
var import_picocolors2 = __toESM(require_picocolors(), 1);
var NPM_REGISTRY_URL = "https://registry.npmjs.org/launch-lms";
var GHCR_BASE = "ghcr.io/launch-lms/app";
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}
async function checkForUpdates() {
  try {
    const resp = await fetch(NPM_REGISTRY_URL, {
      signal: AbortSignal.timeout(3e3),
      headers: { Accept: "application/json" }
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const latest = data["dist-tags"]?.latest;
    if (!latest) return;
    if (compareVersions(latest, VERSION) > 0) {
      console.log();
      console.log(import_picocolors2.default.yellow(`  Update available: ${VERSION} \u2192 ${import_picocolors2.default.bold(latest)}`));
      console.log(import_picocolors2.default.dim(`  Run: ${LOCAL_CLI_COMMAND}`));
      console.log();
    }
  } catch {
  }
}
async function resolveAppImage(channel = "stable") {
  if (channel === "dev") {
    return { image: DEV_IMAGE, isLatest: false };
  }
  const versionedTag = `${GHCR_BASE}:${VERSION}`;
  try {
    const tokenResp = await fetch(
      `https://ghcr.io/token?scope=repository:launch-lms/app:pull`,
      { signal: AbortSignal.timeout(5e3) }
    );
    if (!tokenResp.ok) throw new Error("token fetch failed");
    const { token } = await tokenResp.json();
    const manifestResp = await fetch(
      `https://ghcr.io/v2/launch-lms/app/manifests/${VERSION}`,
      {
        signal: AbortSignal.timeout(5e3),
        headers: {
          Accept: "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json",
          Authorization: `Bearer ${token}`
        }
      }
    );
    if (manifestResp.ok) {
      return { image: versionedTag, isLatest: false };
    }
  } catch {
  }
  return { image: `${GHCR_BASE}:latest`, isLatest: true };
}

// src/commands/setup.ts
import crypto3 from "crypto";
import fs2 from "fs";
import path2 from "path";

// node_modules/@clack/core/dist/index.mjs
import { styleText as y } from "util";
import { stdout as S, stdin as $ } from "process";
import * as _ from "readline";
import P from "readline";

// node_modules/fast-string-truncated-width/dist/utils.js
var isAmbiguous = (x) => {
  return x === 161 || x === 164 || x === 167 || x === 168 || x === 170 || x === 173 || x === 174 || x >= 176 && x <= 180 || x >= 182 && x <= 186 || x >= 188 && x <= 191 || x === 198 || x === 208 || x === 215 || x === 216 || x >= 222 && x <= 225 || x === 230 || x >= 232 && x <= 234 || x === 236 || x === 237 || x === 240 || x === 242 || x === 243 || x >= 247 && x <= 250 || x === 252 || x === 254 || x === 257 || x === 273 || x === 275 || x === 283 || x === 294 || x === 295 || x === 299 || x >= 305 && x <= 307 || x === 312 || x >= 319 && x <= 322 || x === 324 || x >= 328 && x <= 331 || x === 333 || x === 338 || x === 339 || x === 358 || x === 359 || x === 363 || x === 462 || x === 464 || x === 466 || x === 468 || x === 470 || x === 472 || x === 474 || x === 476 || x === 593 || x === 609 || x === 708 || x === 711 || x >= 713 && x <= 715 || x === 717 || x === 720 || x >= 728 && x <= 731 || x === 733 || x === 735 || x >= 768 && x <= 879 || x >= 913 && x <= 929 || x >= 931 && x <= 937 || x >= 945 && x <= 961 || x >= 963 && x <= 969 || x === 1025 || x >= 1040 && x <= 1103 || x === 1105 || x === 8208 || x >= 8211 && x <= 8214 || x === 8216 || x === 8217 || x === 8220 || x === 8221 || x >= 8224 && x <= 8226 || x >= 8228 && x <= 8231 || x === 8240 || x === 8242 || x === 8243 || x === 8245 || x === 8251 || x === 8254 || x === 8308 || x === 8319 || x >= 8321 && x <= 8324 || x === 8364 || x === 8451 || x === 8453 || x === 8457 || x === 8467 || x === 8470 || x === 8481 || x === 8482 || x === 8486 || x === 8491 || x === 8531 || x === 8532 || x >= 8539 && x <= 8542 || x >= 8544 && x <= 8555 || x >= 8560 && x <= 8569 || x === 8585 || x >= 8592 && x <= 8601 || x === 8632 || x === 8633 || x === 8658 || x === 8660 || x === 8679 || x === 8704 || x === 8706 || x === 8707 || x === 8711 || x === 8712 || x === 8715 || x === 8719 || x === 8721 || x === 8725 || x === 8730 || x >= 8733 && x <= 8736 || x === 8739 || x === 8741 || x >= 8743 && x <= 8748 || x === 8750 || x >= 8756 && x <= 8759 || x === 8764 || x === 8765 || x === 8776 || x === 8780 || x === 8786 || x === 8800 || x === 8801 || x >= 8804 && x <= 8807 || x === 8810 || x === 8811 || x === 8814 || x === 8815 || x === 8834 || x === 8835 || x === 8838 || x === 8839 || x === 8853 || x === 8857 || x === 8869 || x === 8895 || x === 8978 || x >= 9312 && x <= 9449 || x >= 9451 && x <= 9547 || x >= 9552 && x <= 9587 || x >= 9600 && x <= 9615 || x >= 9618 && x <= 9621 || x === 9632 || x === 9633 || x >= 9635 && x <= 9641 || x === 9650 || x === 9651 || x === 9654 || x === 9655 || x === 9660 || x === 9661 || x === 9664 || x === 9665 || x >= 9670 && x <= 9672 || x === 9675 || x >= 9678 && x <= 9681 || x >= 9698 && x <= 9701 || x === 9711 || x === 9733 || x === 9734 || x === 9737 || x === 9742 || x === 9743 || x === 9756 || x === 9758 || x === 9792 || x === 9794 || x === 9824 || x === 9825 || x >= 9827 && x <= 9829 || x >= 9831 && x <= 9834 || x === 9836 || x === 9837 || x === 9839 || x === 9886 || x === 9887 || x === 9919 || x >= 9926 && x <= 9933 || x >= 9935 && x <= 9939 || x >= 9941 && x <= 9953 || x === 9955 || x === 9960 || x === 9961 || x >= 9963 && x <= 9969 || x === 9972 || x >= 9974 && x <= 9977 || x === 9979 || x === 9980 || x === 9982 || x === 9983 || x === 10045 || x >= 10102 && x <= 10111 || x >= 11094 && x <= 11097 || x >= 12872 && x <= 12879 || x >= 57344 && x <= 63743 || x >= 65024 && x <= 65039 || x === 65533 || x >= 127232 && x <= 127242 || x >= 127248 && x <= 127277 || x >= 127280 && x <= 127337 || x >= 127344 && x <= 127373 || x === 127375 || x === 127376 || x >= 127387 && x <= 127404 || x >= 917760 && x <= 917999 || x >= 983040 && x <= 1048573 || x >= 1048576 && x <= 1114109;
};
var isFullWidth = (x) => {
  return x === 12288 || x >= 65281 && x <= 65376 || x >= 65504 && x <= 65510;
};
var isWide = (x) => {
  return x >= 4352 && x <= 4447 || x === 8986 || x === 8987 || x === 9001 || x === 9002 || x >= 9193 && x <= 9196 || x === 9200 || x === 9203 || x === 9725 || x === 9726 || x === 9748 || x === 9749 || x >= 9800 && x <= 9811 || x === 9855 || x === 9875 || x === 9889 || x === 9898 || x === 9899 || x === 9917 || x === 9918 || x === 9924 || x === 9925 || x === 9934 || x === 9940 || x === 9962 || x === 9970 || x === 9971 || x === 9973 || x === 9978 || x === 9981 || x === 9989 || x === 9994 || x === 9995 || x === 10024 || x === 10060 || x === 10062 || x >= 10067 && x <= 10069 || x === 10071 || x >= 10133 && x <= 10135 || x === 10160 || x === 10175 || x === 11035 || x === 11036 || x === 11088 || x === 11093 || x >= 11904 && x <= 11929 || x >= 11931 && x <= 12019 || x >= 12032 && x <= 12245 || x >= 12272 && x <= 12287 || x >= 12289 && x <= 12350 || x >= 12353 && x <= 12438 || x >= 12441 && x <= 12543 || x >= 12549 && x <= 12591 || x >= 12593 && x <= 12686 || x >= 12688 && x <= 12771 || x >= 12783 && x <= 12830 || x >= 12832 && x <= 12871 || x >= 12880 && x <= 19903 || x >= 19968 && x <= 42124 || x >= 42128 && x <= 42182 || x >= 43360 && x <= 43388 || x >= 44032 && x <= 55203 || x >= 63744 && x <= 64255 || x >= 65040 && x <= 65049 || x >= 65072 && x <= 65106 || x >= 65108 && x <= 65126 || x >= 65128 && x <= 65131 || x >= 94176 && x <= 94180 || x === 94192 || x === 94193 || x >= 94208 && x <= 100343 || x >= 100352 && x <= 101589 || x >= 101632 && x <= 101640 || x >= 110576 && x <= 110579 || x >= 110581 && x <= 110587 || x === 110589 || x === 110590 || x >= 110592 && x <= 110882 || x === 110898 || x >= 110928 && x <= 110930 || x === 110933 || x >= 110948 && x <= 110951 || x >= 110960 && x <= 111355 || x === 126980 || x === 127183 || x === 127374 || x >= 127377 && x <= 127386 || x >= 127488 && x <= 127490 || x >= 127504 && x <= 127547 || x >= 127552 && x <= 127560 || x === 127568 || x === 127569 || x >= 127584 && x <= 127589 || x >= 127744 && x <= 127776 || x >= 127789 && x <= 127797 || x >= 127799 && x <= 127868 || x >= 127870 && x <= 127891 || x >= 127904 && x <= 127946 || x >= 127951 && x <= 127955 || x >= 127968 && x <= 127984 || x === 127988 || x >= 127992 && x <= 128062 || x === 128064 || x >= 128066 && x <= 128252 || x >= 128255 && x <= 128317 || x >= 128331 && x <= 128334 || x >= 128336 && x <= 128359 || x === 128378 || x === 128405 || x === 128406 || x === 128420 || x >= 128507 && x <= 128591 || x >= 128640 && x <= 128709 || x === 128716 || x >= 128720 && x <= 128722 || x >= 128725 && x <= 128727 || x >= 128732 && x <= 128735 || x === 128747 || x === 128748 || x >= 128756 && x <= 128764 || x >= 128992 && x <= 129003 || x === 129008 || x >= 129292 && x <= 129338 || x >= 129340 && x <= 129349 || x >= 129351 && x <= 129535 || x >= 129648 && x <= 129660 || x >= 129664 && x <= 129672 || x >= 129680 && x <= 129725 || x >= 129727 && x <= 129733 || x >= 129742 && x <= 129755 || x >= 129760 && x <= 129768 || x >= 129776 && x <= 129784 || x >= 131072 && x <= 196605 || x >= 196608 && x <= 262141;
};

// node_modules/fast-string-truncated-width/dist/index.js
var ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/y;
var CONTROL_RE = /[\x00-\x08\x0A-\x1F\x7F-\x9F]{1,1000}/y;
var TAB_RE = /\t{1,1000}/y;
var EMOJI_RE = new RegExp("[\\u{1F1E6}-\\u{1F1FF}]{2}|\\u{1F3F4}[\\u{E0061}-\\u{E007A}]{2}[\\u{E0030}-\\u{E0039}\\u{E0061}-\\u{E007A}]{1,3}\\u{E007F}|(?:\\p{Emoji}\\uFE0F\\u20E3?|\\p{Emoji_Modifier_Base}\\p{Emoji_Modifier}?|\\p{Emoji_Presentation})(?:\\u200D(?:\\p{Emoji_Modifier_Base}\\p{Emoji_Modifier}?|\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F\\u20E3?))*", "yu");
var LATIN_RE = /(?:[\x20-\x7E\xA0-\xFF](?!\uFE0F)){1,1000}/y;
var MODIFIER_RE = new RegExp("\\p{M}+", "gu");
var NO_TRUNCATION = { limit: Infinity, ellipsis: "" };
var getStringTruncatedWidth = (input, truncationOptions = {}, widthOptions = {}) => {
  const LIMIT = truncationOptions.limit ?? Infinity;
  const ELLIPSIS = truncationOptions.ellipsis ?? "";
  const ELLIPSIS_WIDTH = truncationOptions?.ellipsisWidth ?? (ELLIPSIS ? getStringTruncatedWidth(ELLIPSIS, NO_TRUNCATION, widthOptions).width : 0);
  const ANSI_WIDTH = widthOptions.ansiWidth ?? 0;
  const CONTROL_WIDTH = widthOptions.controlWidth ?? 0;
  const TAB_WIDTH = widthOptions.tabWidth ?? 8;
  const AMBIGUOUS_WIDTH = widthOptions.ambiguousWidth ?? 1;
  const EMOJI_WIDTH = widthOptions.emojiWidth ?? 2;
  const FULL_WIDTH_WIDTH = widthOptions.fullWidthWidth ?? 2;
  const REGULAR_WIDTH = widthOptions.regularWidth ?? 1;
  const WIDE_WIDTH = widthOptions.wideWidth ?? 2;
  let indexPrev = 0;
  let index = 0;
  let length = input.length;
  let lengthExtra = 0;
  let truncationEnabled = false;
  let truncationIndex = length;
  let truncationLimit = Math.max(0, LIMIT - ELLIPSIS_WIDTH);
  let unmatchedStart = 0;
  let unmatchedEnd = 0;
  let width = 0;
  let widthExtra = 0;
  outer: while (true) {
    if (unmatchedEnd > unmatchedStart || index >= length && index > indexPrev) {
      const unmatched = input.slice(unmatchedStart, unmatchedEnd) || input.slice(indexPrev, index);
      lengthExtra = 0;
      for (const char of unmatched.replaceAll(MODIFIER_RE, "")) {
        const codePoint = char.codePointAt(0) || 0;
        if (isFullWidth(codePoint)) {
          widthExtra = FULL_WIDTH_WIDTH;
        } else if (isWide(codePoint)) {
          widthExtra = WIDE_WIDTH;
        } else if (AMBIGUOUS_WIDTH !== REGULAR_WIDTH && isAmbiguous(codePoint)) {
          widthExtra = AMBIGUOUS_WIDTH;
        } else {
          widthExtra = REGULAR_WIDTH;
        }
        if (width + widthExtra > truncationLimit) {
          truncationIndex = Math.min(truncationIndex, Math.max(unmatchedStart, indexPrev) + lengthExtra);
        }
        if (width + widthExtra > LIMIT) {
          truncationEnabled = true;
          break outer;
        }
        lengthExtra += char.length;
        width += widthExtra;
      }
      unmatchedStart = unmatchedEnd = 0;
    }
    if (index >= length)
      break;
    LATIN_RE.lastIndex = index;
    if (LATIN_RE.test(input)) {
      lengthExtra = LATIN_RE.lastIndex - index;
      widthExtra = lengthExtra * REGULAR_WIDTH;
      if (width + widthExtra > truncationLimit) {
        truncationIndex = Math.min(truncationIndex, index + Math.floor((truncationLimit - width) / REGULAR_WIDTH));
      }
      if (width + widthExtra > LIMIT) {
        truncationEnabled = true;
        break;
      }
      width += widthExtra;
      unmatchedStart = indexPrev;
      unmatchedEnd = index;
      index = indexPrev = LATIN_RE.lastIndex;
      continue;
    }
    ANSI_RE.lastIndex = index;
    if (ANSI_RE.test(input)) {
      if (width + ANSI_WIDTH > truncationLimit) {
        truncationIndex = Math.min(truncationIndex, index);
      }
      if (width + ANSI_WIDTH > LIMIT) {
        truncationEnabled = true;
        break;
      }
      width += ANSI_WIDTH;
      unmatchedStart = indexPrev;
      unmatchedEnd = index;
      index = indexPrev = ANSI_RE.lastIndex;
      continue;
    }
    CONTROL_RE.lastIndex = index;
    if (CONTROL_RE.test(input)) {
      lengthExtra = CONTROL_RE.lastIndex - index;
      widthExtra = lengthExtra * CONTROL_WIDTH;
      if (width + widthExtra > truncationLimit) {
        truncationIndex = Math.min(truncationIndex, index + Math.floor((truncationLimit - width) / CONTROL_WIDTH));
      }
      if (width + widthExtra > LIMIT) {
        truncationEnabled = true;
        break;
      }
      width += widthExtra;
      unmatchedStart = indexPrev;
      unmatchedEnd = index;
      index = indexPrev = CONTROL_RE.lastIndex;
      continue;
    }
    TAB_RE.lastIndex = index;
    if (TAB_RE.test(input)) {
      lengthExtra = TAB_RE.lastIndex - index;
      widthExtra = lengthExtra * TAB_WIDTH;
      if (width + widthExtra > truncationLimit) {
        truncationIndex = Math.min(truncationIndex, index + Math.floor((truncationLimit - width) / TAB_WIDTH));
      }
      if (width + widthExtra > LIMIT) {
        truncationEnabled = true;
        break;
      }
      width += widthExtra;
      unmatchedStart = indexPrev;
      unmatchedEnd = index;
      index = indexPrev = TAB_RE.lastIndex;
      continue;
    }
    EMOJI_RE.lastIndex = index;
    if (EMOJI_RE.test(input)) {
      if (width + EMOJI_WIDTH > truncationLimit) {
        truncationIndex = Math.min(truncationIndex, index);
      }
      if (width + EMOJI_WIDTH > LIMIT) {
        truncationEnabled = true;
        break;
      }
      width += EMOJI_WIDTH;
      unmatchedStart = indexPrev;
      unmatchedEnd = index;
      index = indexPrev = EMOJI_RE.lastIndex;
      continue;
    }
    index += 1;
  }
  return {
    width: truncationEnabled ? truncationLimit : width,
    index: truncationEnabled ? truncationIndex : length,
    truncated: truncationEnabled,
    ellipsed: truncationEnabled && LIMIT >= ELLIPSIS_WIDTH
  };
};
var dist_default = getStringTruncatedWidth;

// node_modules/fast-string-width/dist/index.js
var NO_TRUNCATION2 = {
  limit: Infinity,
  ellipsis: "",
  ellipsisWidth: 0
};
var fastStringWidth = (input, options = {}) => {
  return dist_default(input, NO_TRUNCATION2, options).width;
};
var dist_default2 = fastStringWidth;

// node_modules/fast-wrap-ansi/lib/main.js
var ESC = "\x1B";
var CSI = "\x9B";
var END_CODE = 39;
var ANSI_ESCAPE_BELL = "\x07";
var ANSI_CSI = "[";
var ANSI_OSC = "]";
var ANSI_SGR_TERMINATOR = "m";
var ANSI_ESCAPE_LINK = `${ANSI_OSC}8;;`;
var GROUP_REGEX = new RegExp(`(?:\\${ANSI_CSI}(?<code>\\d+)m|\\${ANSI_ESCAPE_LINK}(?<uri>.*)${ANSI_ESCAPE_BELL})`, "y");
var getClosingCode = (openingCode) => {
  if (openingCode >= 30 && openingCode <= 37)
    return 39;
  if (openingCode >= 90 && openingCode <= 97)
    return 39;
  if (openingCode >= 40 && openingCode <= 47)
    return 49;
  if (openingCode >= 100 && openingCode <= 107)
    return 49;
  if (openingCode === 1 || openingCode === 2)
    return 22;
  if (openingCode === 3)
    return 23;
  if (openingCode === 4)
    return 24;
  if (openingCode === 7)
    return 27;
  if (openingCode === 8)
    return 28;
  if (openingCode === 9)
    return 29;
  if (openingCode === 0)
    return 0;
  return void 0;
};
var wrapAnsiCode = (code) => `${ESC}${ANSI_CSI}${code}${ANSI_SGR_TERMINATOR}`;
var wrapAnsiHyperlink = (url) => `${ESC}${ANSI_ESCAPE_LINK}${url}${ANSI_ESCAPE_BELL}`;
var wrapWord = (rows, word, columns) => {
  const characters = word[Symbol.iterator]();
  let isInsideEscape = false;
  let isInsideLinkEscape = false;
  let lastRow = rows.at(-1);
  let visible = lastRow === void 0 ? 0 : dist_default2(lastRow);
  let currentCharacter = characters.next();
  let nextCharacter = characters.next();
  let rawCharacterIndex = 0;
  while (!currentCharacter.done) {
    const character = currentCharacter.value;
    const characterLength = dist_default2(character);
    if (visible + characterLength <= columns) {
      rows[rows.length - 1] += character;
    } else {
      rows.push(character);
      visible = 0;
    }
    if (character === ESC || character === CSI) {
      isInsideEscape = true;
      isInsideLinkEscape = word.startsWith(ANSI_ESCAPE_LINK, rawCharacterIndex + 1);
    }
    if (isInsideEscape) {
      if (isInsideLinkEscape) {
        if (character === ANSI_ESCAPE_BELL) {
          isInsideEscape = false;
          isInsideLinkEscape = false;
        }
      } else if (character === ANSI_SGR_TERMINATOR) {
        isInsideEscape = false;
      }
    } else {
      visible += characterLength;
      if (visible === columns && !nextCharacter.done) {
        rows.push("");
        visible = 0;
      }
    }
    currentCharacter = nextCharacter;
    nextCharacter = characters.next();
    rawCharacterIndex += character.length;
  }
  lastRow = rows.at(-1);
  if (!visible && lastRow !== void 0 && lastRow.length && rows.length > 1) {
    rows[rows.length - 2] += rows.pop();
  }
};
var stringVisibleTrimSpacesRight = (string) => {
  const words = string.split(" ");
  let last = words.length;
  while (last) {
    if (dist_default2(words[last - 1])) {
      break;
    }
    last--;
  }
  if (last === words.length) {
    return string;
  }
  return words.slice(0, last).join(" ") + words.slice(last).join("");
};
var exec = (string, columns, options = {}) => {
  if (options.trim !== false && string.trim() === "") {
    return "";
  }
  let returnValue = "";
  let escapeCode;
  let escapeUrl;
  const words = string.split(" ");
  let rows = [""];
  let rowLength = 0;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (options.trim !== false) {
      const row = rows.at(-1) ?? "";
      const trimmed = row.trimStart();
      if (row.length !== trimmed.length) {
        rows[rows.length - 1] = trimmed;
        rowLength = dist_default2(trimmed);
      }
    }
    if (index !== 0) {
      if (rowLength >= columns && (options.wordWrap === false || options.trim === false)) {
        rows.push("");
        rowLength = 0;
      }
      if (rowLength || options.trim === false) {
        rows[rows.length - 1] += " ";
        rowLength++;
      }
    }
    const wordLength = dist_default2(word);
    if (options.hard && wordLength > columns) {
      const remainingColumns = columns - rowLength;
      const breaksStartingThisLine = 1 + Math.floor((wordLength - remainingColumns - 1) / columns);
      const breaksStartingNextLine = Math.floor((wordLength - 1) / columns);
      if (breaksStartingNextLine < breaksStartingThisLine) {
        rows.push("");
      }
      wrapWord(rows, word, columns);
      rowLength = dist_default2(rows.at(-1) ?? "");
      continue;
    }
    if (rowLength + wordLength > columns && rowLength && wordLength) {
      if (options.wordWrap === false && rowLength < columns) {
        wrapWord(rows, word, columns);
        rowLength = dist_default2(rows.at(-1) ?? "");
        continue;
      }
      rows.push("");
      rowLength = 0;
    }
    if (rowLength + wordLength > columns && options.wordWrap === false) {
      wrapWord(rows, word, columns);
      rowLength = dist_default2(rows.at(-1) ?? "");
      continue;
    }
    rows[rows.length - 1] += word;
    rowLength += wordLength;
  }
  if (options.trim !== false) {
    rows = rows.map((row) => stringVisibleTrimSpacesRight(row));
  }
  const preString = rows.join("\n");
  let inSurrogate = false;
  for (let i = 0; i < preString.length; i++) {
    const character = preString[i];
    returnValue += character;
    if (!inSurrogate) {
      inSurrogate = character >= "\uD800" && character <= "\uDBFF";
    } else {
      continue;
    }
    if (character === ESC || character === CSI) {
      GROUP_REGEX.lastIndex = i + 1;
      const groupsResult = GROUP_REGEX.exec(preString);
      const groups = groupsResult?.groups;
      if (groups?.code !== void 0) {
        const code = Number.parseFloat(groups.code);
        escapeCode = code === END_CODE ? void 0 : code;
      } else if (groups?.uri !== void 0) {
        escapeUrl = groups.uri.length === 0 ? void 0 : groups.uri;
      }
    }
    if (preString[i + 1] === "\n") {
      if (escapeUrl) {
        returnValue += wrapAnsiHyperlink("");
      }
      const closingCode = escapeCode ? getClosingCode(escapeCode) : void 0;
      if (escapeCode && closingCode) {
        returnValue += wrapAnsiCode(closingCode);
      }
    } else if (character === "\n") {
      if (escapeCode && getClosingCode(escapeCode)) {
        returnValue += wrapAnsiCode(escapeCode);
      }
      if (escapeUrl) {
        returnValue += wrapAnsiHyperlink(escapeUrl);
      }
    }
  }
  return returnValue;
};
var CRLF_OR_LF = /\r?\n/;
function wrapAnsi(string, columns, options) {
  return String(string).normalize().split(CRLF_OR_LF).map((line) => exec(line, columns, options)).join("\n");
}

// node_modules/@clack/core/dist/index.mjs
var import_sisteransi = __toESM(require_src(), 1);
import { ReadStream as D } from "tty";
function d(r, t2, e) {
  if (!e.some((o) => !o.disabled)) return r;
  const s = r + t2, i = Math.max(e.length - 1, 0), n = s < 0 ? i : s > i ? 0 : s;
  return e[n].disabled ? d(n, t2 < 0 ? -1 : 1, e) : n;
}
var E = ["up", "down", "left", "right", "space", "enter", "cancel"];
var G = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
var u = { actions: new Set(E), aliases: /* @__PURE__ */ new Map([["k", "up"], ["j", "down"], ["h", "left"], ["l", "right"], ["", "cancel"], ["escape", "cancel"]]), messages: { cancel: "Canceled", error: "Something went wrong" }, withGuide: true, date: { monthNames: [...G], messages: { required: "Please enter a valid date", invalidMonth: "There are only 12 months in a year", invalidDay: (r, t2) => `There are only ${r} days in ${t2}`, afterMin: (r) => `Date must be on or after ${r.toISOString().slice(0, 10)}`, beforeMax: (r) => `Date must be on or before ${r.toISOString().slice(0, 10)}` } } };
function V(r, t2) {
  if (typeof r == "string") return u.aliases.get(r) === t2;
  for (const e of r) if (e !== void 0 && V(e, t2)) return true;
  return false;
}
function j(r, t2) {
  if (r === t2) return;
  const e = r.split(`
`), s = t2.split(`
`), i = Math.max(e.length, s.length), n = [];
  for (let o = 0; o < i; o++) e[o] !== s[o] && n.push(o);
  return { lines: n, numLinesBefore: e.length, numLinesAfter: s.length, numLines: i };
}
var Y = globalThis.process.platform.startsWith("win");
var C = /* @__PURE__ */ Symbol("clack:cancel");
function q(r) {
  return r === C;
}
function w(r, t2) {
  const e = r;
  e.isTTY && e.setRawMode(t2);
}
function z({ input: r = $, output: t2 = S, overwrite: e = true, hideCursor: s = true } = {}) {
  const i = _.createInterface({ input: r, output: t2, prompt: "", tabSize: 1 });
  _.emitKeypressEvents(r, i), r instanceof D && r.isTTY && r.setRawMode(true);
  const n = (o, { name: a, sequence: h }) => {
    const l = String(o);
    if (V([l, a, h], "cancel")) {
      s && t2.write(import_sisteransi.cursor.show), process.exit(0);
      return;
    }
    if (!e) return;
    const f = a === "return" ? 0 : -1, v = a === "return" ? -1 : 0;
    _.moveCursor(t2, f, v, () => {
      _.clearLine(t2, 1, () => {
        r.once("keypress", n);
      });
    });
  };
  return s && t2.write(import_sisteransi.cursor.hide), r.once("keypress", n), () => {
    r.off("keypress", n), s && t2.write(import_sisteransi.cursor.show), r instanceof D && r.isTTY && !Y && r.setRawMode(false), i.terminal = false, i.close();
  };
}
var O = (r) => "columns" in r && typeof r.columns == "number" ? r.columns : 80;
var A = (r) => "rows" in r && typeof r.rows == "number" ? r.rows : 20;
function R(r, t2, e, s = e) {
  const i = O(r ?? S);
  return wrapAnsi(t2, i - e.length, { hard: true, trim: false }).split(`
`).map((n, o) => `${o === 0 ? s : e}${n}`).join(`
`);
}
var p = class {
  input;
  output;
  _abortSignal;
  rl;
  opts;
  _render;
  _track = false;
  _prevFrame = "";
  _subscribers = /* @__PURE__ */ new Map();
  _cursor = 0;
  state = "initial";
  error = "";
  value;
  userInput = "";
  constructor(t2, e = true) {
    const { input: s = $, output: i = S, render: n, signal: o, ...a } = t2;
    this.opts = a, this.onKeypress = this.onKeypress.bind(this), this.close = this.close.bind(this), this.render = this.render.bind(this), this._render = n.bind(this), this._track = e, this._abortSignal = o, this.input = s, this.output = i;
  }
  unsubscribe() {
    this._subscribers.clear();
  }
  setSubscriber(t2, e) {
    const s = this._subscribers.get(t2) ?? [];
    s.push(e), this._subscribers.set(t2, s);
  }
  on(t2, e) {
    this.setSubscriber(t2, { cb: e });
  }
  once(t2, e) {
    this.setSubscriber(t2, { cb: e, once: true });
  }
  emit(t2, ...e) {
    const s = this._subscribers.get(t2) ?? [], i = [];
    for (const n of s) n.cb(...e), n.once && i.push(() => s.splice(s.indexOf(n), 1));
    for (const n of i) n();
  }
  prompt() {
    return new Promise((t2) => {
      if (this._abortSignal) {
        if (this._abortSignal.aborted) return this.state = "cancel", this.close(), t2(C);
        this._abortSignal.addEventListener("abort", () => {
          this.state = "cancel", this.close();
        }, { once: true });
      }
      this.rl = P.createInterface({ input: this.input, tabSize: 2, prompt: "", escapeCodeTimeout: 50, terminal: true }), this.rl.prompt(), this.opts.initialUserInput !== void 0 && this._setUserInput(this.opts.initialUserInput, true), this.input.on("keypress", this.onKeypress), w(this.input, true), this.output.on("resize", this.render), this.render(), this.once("submit", () => {
        this.output.write(import_sisteransi.cursor.show), this.output.off("resize", this.render), w(this.input, false), t2(this.value);
      }), this.once("cancel", () => {
        this.output.write(import_sisteransi.cursor.show), this.output.off("resize", this.render), w(this.input, false), t2(C);
      });
    });
  }
  _isActionKey(t2, e) {
    return t2 === "	";
  }
  _setValue(t2) {
    this.value = t2, this.emit("value", this.value);
  }
  _setUserInput(t2, e) {
    this.userInput = t2 ?? "", this.emit("userInput", this.userInput), e && this._track && this.rl && (this.rl.write(this.userInput), this._cursor = this.rl.cursor);
  }
  _clearUserInput() {
    this.rl?.write(null, { ctrl: true, name: "u" }), this._setUserInput("");
  }
  onKeypress(t2, e) {
    if (this._track && e.name !== "return" && (e.name && this._isActionKey(t2, e) && this.rl?.write(null, { ctrl: true, name: "h" }), this._cursor = this.rl?.cursor ?? 0, this._setUserInput(this.rl?.line)), this.state === "error" && (this.state = "active"), e?.name && (!this._track && u.aliases.has(e.name) && this.emit("cursor", u.aliases.get(e.name)), u.actions.has(e.name) && this.emit("cursor", e.name)), t2 && (t2.toLowerCase() === "y" || t2.toLowerCase() === "n") && this.emit("confirm", t2.toLowerCase() === "y"), this.emit("key", t2?.toLowerCase(), e), e?.name === "return") {
      if (this.opts.validate) {
        const s = this.opts.validate(this.value);
        s && (this.error = s instanceof Error ? s.message : s, this.state = "error", this.rl?.write(this.userInput));
      }
      this.state !== "error" && (this.state = "submit");
    }
    V([t2, e?.name, e?.sequence], "cancel") && (this.state = "cancel"), (this.state === "submit" || this.state === "cancel") && this.emit("finalize"), this.render(), (this.state === "submit" || this.state === "cancel") && this.close();
  }
  close() {
    this.input.unpipe(), this.input.removeListener("keypress", this.onKeypress), this.output.write(`
`), w(this.input, false), this.rl?.close(), this.rl = void 0, this.emit(`${this.state}`, this.value), this.unsubscribe();
  }
  restoreCursor() {
    const t2 = wrapAnsi(this._prevFrame, process.stdout.columns, { hard: true, trim: false }).split(`
`).length - 1;
    this.output.write(import_sisteransi.cursor.move(-999, t2 * -1));
  }
  render() {
    const t2 = wrapAnsi(this._render(this) ?? "", process.stdout.columns, { hard: true, trim: false });
    if (t2 !== this._prevFrame) {
      if (this.state === "initial") this.output.write(import_sisteransi.cursor.hide);
      else {
        const e = j(this._prevFrame, t2), s = A(this.output);
        if (this.restoreCursor(), e) {
          const i = Math.max(0, e.numLinesAfter - s), n = Math.max(0, e.numLinesBefore - s);
          let o = e.lines.find((a) => a >= i);
          if (o === void 0) {
            this._prevFrame = t2;
            return;
          }
          if (e.lines.length === 1) {
            this.output.write(import_sisteransi.cursor.move(0, o - n)), this.output.write(import_sisteransi.erase.lines(1));
            const a = t2.split(`
`);
            this.output.write(a[o]), this._prevFrame = t2, this.output.write(import_sisteransi.cursor.move(0, a.length - o - 1));
            return;
          } else if (e.lines.length > 1) {
            if (i < n) o = i;
            else {
              const h = o - n;
              h > 0 && this.output.write(import_sisteransi.cursor.move(0, h));
            }
            this.output.write(import_sisteransi.erase.down());
            const a = t2.split(`
`).slice(o);
            this.output.write(a.join(`
`)), this._prevFrame = t2;
            return;
          }
        }
        this.output.write(import_sisteransi.erase.down());
      }
      this.output.write(t2), this.state === "initial" && (this.state = "active"), this._prevFrame = t2;
    }
  }
};
var Q = class extends p {
  get cursor() {
    return this.value ? 0 : 1;
  }
  get _value() {
    return this.cursor === 0;
  }
  constructor(t2) {
    super(t2, false), this.value = !!t2.initialValue, this.on("userInput", () => {
      this.value = this._value;
    }), this.on("confirm", (e) => {
      this.output.write(import_sisteransi.cursor.move(0, -1)), this.value = e, this.state = "submit", this.close();
    }), this.on("cursor", () => {
      this.value = !this.value;
    });
  }
};
var it = class extends p {
  options;
  cursor = 0;
  get _value() {
    return this.options[this.cursor].value;
  }
  get _enabledOptions() {
    return this.options.filter((t2) => t2.disabled !== true);
  }
  toggleAll() {
    const t2 = this._enabledOptions, e = this.value !== void 0 && this.value.length === t2.length;
    this.value = e ? [] : t2.map((s) => s.value);
  }
  toggleInvert() {
    const t2 = this.value;
    if (!t2) return;
    const e = this._enabledOptions.filter((s) => !t2.includes(s.value));
    this.value = e.map((s) => s.value);
  }
  toggleValue() {
    this.value === void 0 && (this.value = []);
    const t2 = this.value.includes(this._value);
    this.value = t2 ? this.value.filter((e) => e !== this._value) : [...this.value, this._value];
  }
  constructor(t2) {
    super(t2, false), this.options = t2.options, this.value = [...t2.initialValues ?? []];
    const e = Math.max(this.options.findIndex(({ value: s }) => s === t2.cursorAt), 0);
    this.cursor = this.options[e].disabled ? d(e, 1, this.options) : e, this.on("key", (s) => {
      s === "a" && this.toggleAll(), s === "i" && this.toggleInvert();
    }), this.on("cursor", (s) => {
      switch (s) {
        case "left":
        case "up":
          this.cursor = d(this.cursor, -1, this.options);
          break;
        case "down":
        case "right":
          this.cursor = d(this.cursor, 1, this.options);
          break;
        case "space":
          this.toggleValue();
          break;
      }
    });
  }
};
var rt = class extends p {
  _mask = "\u2022";
  get cursor() {
    return this._cursor;
  }
  get masked() {
    return this.userInput.replaceAll(/./g, this._mask);
  }
  get userInputWithCursor() {
    if (this.state === "submit" || this.state === "cancel") return this.masked;
    const t2 = this.userInput;
    if (this.cursor >= t2.length) return `${this.masked}${y(["inverse", "hidden"], "_")}`;
    const e = this.masked, s = e.slice(0, this.cursor), i = e.slice(this.cursor);
    return `${s}${y("inverse", i[0])}${i.slice(1)}`;
  }
  clear() {
    this._clearUserInput();
  }
  constructor({ mask: t2, ...e }) {
    super(e), this._mask = t2 ?? "\u2022", this.on("userInput", (s) => {
      this._setValue(s);
    });
  }
};
var nt = class extends p {
  options;
  cursor = 0;
  get _selectedValue() {
    return this.options[this.cursor];
  }
  changeValue() {
    this.value = this._selectedValue.value;
  }
  constructor(t2) {
    super(t2, false), this.options = t2.options;
    const e = this.options.findIndex(({ value: i }) => i === t2.initialValue), s = e === -1 ? 0 : e;
    this.cursor = this.options[s].disabled ? d(s, 1, this.options) : s, this.changeValue(), this.on("cursor", (i) => {
      switch (i) {
        case "left":
        case "up":
          this.cursor = d(this.cursor, -1, this.options);
          break;
        case "down":
        case "right":
          this.cursor = d(this.cursor, 1, this.options);
          break;
      }
      this.changeValue();
    });
  }
};
var at = class extends p {
  get userInputWithCursor() {
    if (this.state === "submit") return this.userInput;
    const t2 = this.userInput;
    if (this.cursor >= t2.length) return `${this.userInput}\u2588`;
    const e = t2.slice(0, this.cursor), [s, ...i] = t2.slice(this.cursor);
    return `${e}${y("inverse", s)}${i.join("")}`;
  }
  get cursor() {
    return this._cursor;
  }
  constructor(t2) {
    super({ ...t2, initialUserInput: t2.initialUserInput ?? t2.initialValue }), this.on("userInput", (e) => {
      this._setValue(e);
    }), this.on("finalize", () => {
      this.value || (this.value = t2.defaultValue), this.value === void 0 && (this.value = "");
    });
  }
};

// node_modules/@clack/prompts/dist/index.mjs
import { styleText as t, stripVTControlCharacters as ne } from "util";
import P2 from "process";
var import_sisteransi2 = __toESM(require_src(), 1);
import { existsSync as Xe, lstatSync as we, readdirSync as ze } from "fs";
import { dirname as be, join as Qe } from "path";
function Ze() {
  return P2.platform !== "win32" ? P2.env.TERM !== "linux" : !!P2.env.CI || !!P2.env.WT_SESSION || !!P2.env.TERMINUS_SUBLIME || P2.env.ConEmuTask === "{cmd::Cmder}" || P2.env.TERM_PROGRAM === "Terminus-Sublime" || P2.env.TERM_PROGRAM === "vscode" || P2.env.TERM === "xterm-256color" || P2.env.TERM === "alacritty" || P2.env.TERMINAL_EMULATOR === "JetBrains-JediTerm";
}
var ee = Ze();
var ae = () => process.env.CI === "true";
var w2 = (e, i) => ee ? e : i;
var _e = w2("\u25C6", "*");
var oe = w2("\u25A0", "x");
var ue = w2("\u25B2", "x");
var F = w2("\u25C7", "o");
var le = w2("\u250C", "T");
var d2 = w2("\u2502", "|");
var E2 = w2("\u2514", "\u2014");
var Ie = w2("\u2510", "T");
var Ee = w2("\u2518", "\u2014");
var z2 = w2("\u25CF", ">");
var H2 = w2("\u25CB", " ");
var te = w2("\u25FB", "[\u2022]");
var U = w2("\u25FC", "[+]");
var J = w2("\u25FB", "[ ]");
var xe = w2("\u25AA", "\u2022");
var se = w2("\u2500", "-");
var ce = w2("\u256E", "+");
var Ge = w2("\u251C", "+");
var $e = w2("\u256F", "+");
var de = w2("\u2570", "+");
var Oe = w2("\u256D", "+");
var he = w2("\u25CF", "\u2022");
var pe = w2("\u25C6", "*");
var me = w2("\u25B2", "!");
var ge = w2("\u25A0", "x");
var V2 = (e) => {
  switch (e) {
    case "initial":
    case "active":
      return t("cyan", _e);
    case "cancel":
      return t("red", oe);
    case "error":
      return t("yellow", ue);
    case "submit":
      return t("green", F);
  }
};
var ye = (e) => {
  switch (e) {
    case "initial":
    case "active":
      return t("cyan", d2);
    case "cancel":
      return t("red", d2);
    case "error":
      return t("yellow", d2);
    case "submit":
      return t("green", d2);
  }
};
var et2 = (e, i, s, r, u2) => {
  let n = i, o = 0;
  for (let c2 = s; c2 < r; c2++) {
    const a = e[c2];
    if (n = n - a.length, o++, n <= u2) break;
  }
  return { lineCount: n, removals: o };
};
var Y2 = ({ cursor: e, options: i, style: s, output: r = process.stdout, maxItems: u2 = Number.POSITIVE_INFINITY, columnPadding: n = 0, rowPadding: o = 4 }) => {
  const c2 = O(r) - n, a = A(r), l = t("dim", "..."), $2 = Math.max(a - o, 0), y2 = Math.max(Math.min(u2, $2), 5);
  let p2 = 0;
  e >= y2 - 3 && (p2 = Math.max(Math.min(e - y2 + 3, i.length - y2), 0));
  let m = y2 < i.length && p2 > 0, g = y2 < i.length && p2 + y2 < i.length;
  const S2 = Math.min(p2 + y2, i.length), h = [];
  let f = 0;
  m && f++, g && f++;
  const v = p2 + (m ? 1 : 0), T = S2 - (g ? 1 : 0);
  for (let b = v; b < T; b++) {
    const x = wrapAnsi(s(i[b], b === e), c2, { hard: true, trim: false }).split(`
`);
    h.push(x), f += x.length;
  }
  if (f > $2) {
    let b = 0, x = 0, G2 = f;
    const M2 = e - v, R2 = (j2, D2) => et2(h, G2, j2, D2, $2);
    m ? ({ lineCount: G2, removals: b } = R2(0, M2), G2 > $2 && ({ lineCount: G2, removals: x } = R2(M2 + 1, h.length))) : ({ lineCount: G2, removals: x } = R2(M2 + 1, h.length), G2 > $2 && ({ lineCount: G2, removals: b } = R2(0, M2))), b > 0 && (m = true, h.splice(0, b)), x > 0 && (g = true, h.splice(h.length - x, x));
  }
  const C2 = [];
  m && C2.push(l);
  for (const b of h) for (const x of b) C2.push(x);
  return g && C2.push(l), C2;
};
var ot2 = (e) => {
  const i = e.active ?? "Yes", s = e.inactive ?? "No";
  return new Q({ active: i, inactive: s, signal: e.signal, input: e.input, output: e.output, initialValue: e.initialValue ?? true, render() {
    const r = e.withGuide ?? u.withGuide, u2 = `${V2(this.state)}  `, n = r ? `${t("gray", d2)}  ` : "", o = R(e.output, e.message, n, u2), c2 = `${r ? `${t("gray", d2)}
` : ""}${o}
`, a = this.value ? i : s;
    switch (this.state) {
      case "submit": {
        const l = r ? `${t("gray", d2)}  ` : "";
        return `${c2}${l}${t("dim", a)}`;
      }
      case "cancel": {
        const l = r ? `${t("gray", d2)}  ` : "";
        return `${c2}${l}${t(["strikethrough", "dim"], a)}${r ? `
${t("gray", d2)}` : ""}`;
      }
      default: {
        const l = r ? `${t("cyan", d2)}  ` : "", $2 = r ? t("cyan", E2) : "";
        return `${c2}${l}${this.value ? `${t("green", z2)} ${i}` : `${t("dim", H2)} ${t("dim", i)}`}${e.vertical ? r ? `
${t("cyan", d2)}  ` : `
` : ` ${t("dim", "/")} `}${this.value ? `${t("dim", H2)} ${t("dim", s)}` : `${t("green", z2)} ${s}`}
${$2}
`;
      }
    }
  } }).prompt();
};
var O2 = { message: (e = [], { symbol: i = t("gray", d2), secondarySymbol: s = t("gray", d2), output: r = process.stdout, spacing: u2 = 1, withGuide: n } = {}) => {
  const o = [], c2 = n ?? u.withGuide, a = c2 ? s : "", l = c2 ? `${i}  ` : "", $2 = c2 ? `${s}  ` : "";
  for (let p2 = 0; p2 < u2; p2++) o.push(a);
  const y2 = Array.isArray(e) ? e : e.split(`
`);
  if (y2.length > 0) {
    const [p2, ...m] = y2;
    p2.length > 0 ? o.push(`${l}${p2}`) : o.push(c2 ? i : "");
    for (const g of m) g.length > 0 ? o.push(`${$2}${g}`) : o.push(c2 ? s : "");
  }
  r.write(`${o.join(`
`)}
`);
}, info: (e, i) => {
  O2.message(e, { ...i, symbol: t("blue", he) });
}, success: (e, i) => {
  O2.message(e, { ...i, symbol: t("green", pe) });
}, step: (e, i) => {
  O2.message(e, { ...i, symbol: t("green", F) });
}, warn: (e, i) => {
  O2.message(e, { ...i, symbol: t("yellow", me) });
}, warning: (e, i) => {
  O2.warn(e, i);
}, error: (e, i) => {
  O2.message(e, { ...i, symbol: t("red", ge) });
} };
var pt = (e = "", i) => {
  const s = i?.output ?? process.stdout, r = i?.withGuide ?? u.withGuide ? `${t("gray", E2)}  ` : "";
  s.write(`${r}${t("red", e)}

`);
};
var mt = (e = "", i) => {
  const s = i?.output ?? process.stdout, r = i?.withGuide ?? u.withGuide ? `${t("gray", le)}  ` : "";
  s.write(`${r}${e}
`);
};
var gt = (e = "", i) => {
  const s = i?.output ?? process.stdout, r = i?.withGuide ?? u.withGuide ? `${t("gray", d2)}
${t("gray", E2)}  ` : "";
  s.write(`${r}${e}

`);
};
var Q2 = (e, i) => e.split(`
`).map((s) => i(s)).join(`
`);
var yt = (e) => {
  const i = (r, u2) => {
    const n = r.label ?? String(r.value);
    return u2 === "disabled" ? `${t("gray", J)} ${Q2(n, (o) => t(["strikethrough", "gray"], o))}${r.hint ? ` ${t("dim", `(${r.hint ?? "disabled"})`)}` : ""}` : u2 === "active" ? `${t("cyan", te)} ${n}${r.hint ? ` ${t("dim", `(${r.hint})`)}` : ""}` : u2 === "selected" ? `${t("green", U)} ${Q2(n, (o) => t("dim", o))}${r.hint ? ` ${t("dim", `(${r.hint})`)}` : ""}` : u2 === "cancelled" ? `${Q2(n, (o) => t(["strikethrough", "dim"], o))}` : u2 === "active-selected" ? `${t("green", U)} ${n}${r.hint ? ` ${t("dim", `(${r.hint})`)}` : ""}` : u2 === "submitted" ? `${Q2(n, (o) => t("dim", o))}` : `${t("dim", J)} ${Q2(n, (o) => t("dim", o))}`;
  }, s = e.required ?? true;
  return new it({ options: e.options, signal: e.signal, input: e.input, output: e.output, initialValues: e.initialValues, required: s, cursorAt: e.cursorAt, validate(r) {
    if (s && (r === void 0 || r.length === 0)) return `Please select at least one option.
${t("reset", t("dim", `Press ${t(["gray", "bgWhite", "inverse"], " space ")} to select, ${t("gray", t("bgWhite", t("inverse", " enter ")))} to submit`))}`;
  }, render() {
    const r = e.withGuide ?? u.withGuide, u2 = R(e.output, e.message, r ? `${ye(this.state)}  ` : "", `${V2(this.state)}  `), n = `${r ? `${t("gray", d2)}
` : ""}${u2}
`, o = this.value ?? [], c2 = (a, l) => {
      if (a.disabled) return i(a, "disabled");
      const $2 = o.includes(a.value);
      return l && $2 ? i(a, "active-selected") : $2 ? i(a, "selected") : i(a, l ? "active" : "inactive");
    };
    switch (this.state) {
      case "submit": {
        const a = this.options.filter(({ value: $2 }) => o.includes($2)).map(($2) => i($2, "submitted")).join(t("dim", ", ")) || t("dim", "none"), l = R(e.output, a, r ? `${t("gray", d2)}  ` : "");
        return `${n}${l}`;
      }
      case "cancel": {
        const a = this.options.filter(({ value: $2 }) => o.includes($2)).map(($2) => i($2, "cancelled")).join(t("dim", ", "));
        if (a.trim() === "") return `${n}${t("gray", d2)}`;
        const l = R(e.output, a, r ? `${t("gray", d2)}  ` : "");
        return `${n}${l}${r ? `
${t("gray", d2)}` : ""}`;
      }
      case "error": {
        const a = r ? `${t("yellow", d2)}  ` : "", l = this.error.split(`
`).map((p2, m) => m === 0 ? `${r ? `${t("yellow", E2)}  ` : ""}${t("yellow", p2)}` : `   ${p2}`).join(`
`), $2 = n.split(`
`).length, y2 = l.split(`
`).length + 1;
        return `${n}${a}${Y2({ output: e.output, options: this.options, cursor: this.cursor, maxItems: e.maxItems, columnPadding: a.length, rowPadding: $2 + y2, style: c2 }).join(`
${a}`)}
${l}
`;
      }
      default: {
        const a = r ? `${t("cyan", d2)}  ` : "", l = n.split(`
`).length, $2 = r ? 2 : 1;
        return `${n}${a}${Y2({ output: e.output, options: this.options, cursor: this.cursor, maxItems: e.maxItems, columnPadding: a.length, rowPadding: l + $2, style: c2 }).join(`
${a}`)}
${r ? t("cyan", E2) : ""}
`;
      }
    }
  } }).prompt();
};
var bt = (e) => new rt({ validate: e.validate, mask: e.mask ?? xe, signal: e.signal, input: e.input, output: e.output, render() {
  const i = e.withGuide ?? u.withGuide, s = `${i ? `${t("gray", d2)}
` : ""}${V2(this.state)}  ${e.message}
`, r = this.userInputWithCursor, u2 = this.masked;
  switch (this.state) {
    case "error": {
      const n = i ? `${t("yellow", d2)}  ` : "", o = i ? `${t("yellow", E2)}  ` : "", c2 = u2 ?? "";
      return e.clearOnError && this.clear(), `${s.trim()}
${n}${c2}
${o}${t("yellow", this.error)}
`;
    }
    case "submit": {
      const n = i ? `${t("gray", d2)}  ` : "", o = u2 ? t("dim", u2) : "";
      return `${s}${n}${o}`;
    }
    case "cancel": {
      const n = i ? `${t("gray", d2)}  ` : "", o = u2 ? t(["strikethrough", "dim"], u2) : "";
      return `${s}${n}${o}${u2 && i ? `
${t("gray", d2)}` : ""}`;
    }
    default: {
      const n = i ? `${t("cyan", d2)}  ` : "", o = i ? t("cyan", E2) : "";
      return `${s}${n}${r}
${o}
`;
    }
  }
} }).prompt();
var Ct = (e) => t("magenta", e);
var fe = ({ indicator: e = "dots", onCancel: i, output: s = process.stdout, cancelMessage: r, errorMessage: u2, frames: n = ee ? ["\u25D2", "\u25D0", "\u25D3", "\u25D1"] : ["\u2022", "o", "O", "0"], delay: o = ee ? 80 : 120, signal: c2, ...a } = {}) => {
  const l = ae();
  let $2, y2, p2 = false, m = false, g = "", S2, h = performance.now();
  const f = O(s), v = a?.styleFrame ?? Ct, T = (_2) => {
    const A2 = _2 > 1 ? u2 ?? u.messages.error : r ?? u.messages.cancel;
    m = _2 === 1, p2 && (W(A2, _2), m && typeof i == "function" && i());
  }, C2 = () => T(2), b = () => T(1), x = () => {
    process.on("uncaughtExceptionMonitor", C2), process.on("unhandledRejection", C2), process.on("SIGINT", b), process.on("SIGTERM", b), process.on("exit", T), c2 && c2.addEventListener("abort", b);
  }, G2 = () => {
    process.removeListener("uncaughtExceptionMonitor", C2), process.removeListener("unhandledRejection", C2), process.removeListener("SIGINT", b), process.removeListener("SIGTERM", b), process.removeListener("exit", T), c2 && c2.removeEventListener("abort", b);
  }, M2 = () => {
    if (S2 === void 0) return;
    l && s.write(`
`);
    const _2 = wrapAnsi(S2, f, { hard: true, trim: false }).split(`
`);
    _2.length > 1 && s.write(import_sisteransi2.cursor.up(_2.length - 1)), s.write(import_sisteransi2.cursor.to(0)), s.write(import_sisteransi2.erase.down());
  }, R2 = (_2) => _2.replace(/\.+$/, ""), j2 = (_2) => {
    const A2 = (performance.now() - _2) / 1e3, k = Math.floor(A2 / 60), L = Math.floor(A2 % 60);
    return k > 0 ? `[${k}m ${L}s]` : `[${L}s]`;
  }, D2 = a.withGuide ?? u.withGuide, ie = (_2 = "") => {
    p2 = true, $2 = z({ output: s }), g = R2(_2), h = performance.now(), D2 && s.write(`${t("gray", d2)}
`);
    let A2 = 0, k = 0;
    x(), y2 = setInterval(() => {
      if (l && g === S2) return;
      M2(), S2 = g;
      const L = v(n[A2]);
      let Z;
      if (l) Z = `${L}  ${g}...`;
      else if (e === "timer") Z = `${L}  ${g} ${j2(h)}`;
      else {
        const Be = ".".repeat(Math.floor(k)).slice(0, 3);
        Z = `${L}  ${g}${Be}`;
      }
      const Ne = wrapAnsi(Z, f, { hard: true, trim: false });
      s.write(Ne), A2 = A2 + 1 < n.length ? A2 + 1 : 0, k = k < 4 ? k + 0.125 : 0;
    }, o);
  }, W = (_2 = "", A2 = 0, k = false) => {
    if (!p2) return;
    p2 = false, clearInterval(y2), M2();
    const L = A2 === 0 ? t("green", F) : A2 === 1 ? t("red", oe) : t("red", ue);
    g = _2 ?? g, k || (e === "timer" ? s.write(`${L}  ${g} ${j2(h)}
`) : s.write(`${L}  ${g}
`)), G2(), $2();
  };
  return { start: ie, stop: (_2 = "") => W(_2, 0), message: (_2 = "") => {
    g = R2(_2 ?? g);
  }, cancel: (_2 = "") => W(_2, 1), error: (_2 = "") => W(_2, 2), clear: () => W("", 0, true), get isCancelled() {
    return m;
  } };
};
var Ve = { light: w2("\u2500", "-"), heavy: w2("\u2501", "="), block: w2("\u2588", "#") };
var re = (e, i) => e.includes(`
`) ? e.split(`
`).map((s) => i(s)).join(`
`) : i(e);
var _t = (e) => {
  const i = (s, r) => {
    const u2 = s.label ?? String(s.value);
    switch (r) {
      case "disabled":
        return `${t("gray", H2)} ${re(u2, (n) => t("gray", n))}${s.hint ? ` ${t("dim", `(${s.hint ?? "disabled"})`)}` : ""}`;
      case "selected":
        return `${re(u2, (n) => t("dim", n))}`;
      case "active":
        return `${t("green", z2)} ${u2}${s.hint ? ` ${t("dim", `(${s.hint})`)}` : ""}`;
      case "cancelled":
        return `${re(u2, (n) => t(["strikethrough", "dim"], n))}`;
      default:
        return `${t("dim", H2)} ${re(u2, (n) => t("dim", n))}`;
    }
  };
  return new nt({ options: e.options, signal: e.signal, input: e.input, output: e.output, initialValue: e.initialValue, render() {
    const s = e.withGuide ?? u.withGuide, r = `${V2(this.state)}  `, u2 = `${ye(this.state)}  `, n = R(e.output, e.message, u2, r), o = `${s ? `${t("gray", d2)}
` : ""}${n}
`;
    switch (this.state) {
      case "submit": {
        const c2 = s ? `${t("gray", d2)}  ` : "", a = R(e.output, i(this.options[this.cursor], "selected"), c2);
        return `${o}${a}`;
      }
      case "cancel": {
        const c2 = s ? `${t("gray", d2)}  ` : "", a = R(e.output, i(this.options[this.cursor], "cancelled"), c2);
        return `${o}${a}${s ? `
${t("gray", d2)}` : ""}`;
      }
      default: {
        const c2 = s ? `${t("cyan", d2)}  ` : "", a = s ? t("cyan", E2) : "", l = o.split(`
`).length, $2 = s ? 2 : 1;
        return `${o}${c2}${Y2({ output: e.output, cursor: this.cursor, options: this.options, maxItems: e.maxItems, columnPadding: c2.length, rowPadding: l + $2, style: (y2, p2) => i(y2, y2.disabled ? "disabled" : p2 ? "active" : "inactive") }).join(`
${c2}`)}
${a}
`;
      }
    }
  } }).prompt();
};
var je = `${t("gray", d2)}  `;

// src/utils/prompt.ts
var import_picocolors3 = __toESM(require_picocolors(), 1);
function text(opts) {
  const fillValue = opts.defaultValue ?? opts.placeholder;
  const prompt = new at({
    placeholder: opts.placeholder,
    defaultValue: opts.defaultValue,
    initialValue: opts.initialValue,
    validate: opts.validate ? (value) => {
      const effective = value || opts.defaultValue || "";
      return opts.validate(effective);
    } : void 0,
    render() {
      const withGuide = u.withGuide;
      const head = `${withGuide ? `${import_picocolors3.default.gray(d2)}
` : ""}${V2(this.state)}  ${opts.message}
`;
      const placeholderDisplay = opts.placeholder ? import_picocolors3.default.inverse(opts.placeholder[0]) + import_picocolors3.default.dim(opts.placeholder.slice(1)) : import_picocolors3.default.inverse(import_picocolors3.default.hidden("_"));
      const input = this.userInput ? this.userInputWithCursor : placeholderDisplay;
      const value = this.value ?? "";
      switch (this.state) {
        case "error": {
          const errorMsg = this.error ? `  ${import_picocolors3.default.yellow(this.error)}` : "";
          const bar = withGuide ? `${import_picocolors3.default.yellow(d2)}  ` : "";
          const barEnd = withGuide ? import_picocolors3.default.yellow(E2) : "";
          return `${head.trim()}
${bar}${input}
${barEnd}${errorMsg}
`;
        }
        case "submit": {
          const val = value ? `  ${import_picocolors3.default.dim(value)}` : "";
          const bar = withGuide ? import_picocolors3.default.gray(d2) : "";
          return `${head}${bar}${val}`;
        }
        case "cancel": {
          const val = value ? `  ${import_picocolors3.default.strikethrough(import_picocolors3.default.dim(value))}` : "";
          const bar = withGuide ? import_picocolors3.default.gray(d2) : "";
          return `${head}${bar}${val}${value.trim() ? `
${bar}` : ""}`;
        }
        default: {
          const bar = withGuide ? `${import_picocolors3.default.cyan(d2)}  ` : "";
          const barEnd = withGuide ? import_picocolors3.default.cyan(E2) : "";
          return `${head}${bar}${input}
${barEnd}
`;
        }
      }
    }
  });
  if (fillValue) {
    prompt.on("key", (_key, info) => {
      if (info?.name === "tab" && !prompt.userInput) {
        ;
        prompt._setUserInput(fillValue, true);
      }
    });
  }
  return prompt.prompt();
}

// src/commands/setup.ts
var import_picocolors6 = __toESM(require_picocolors(), 1);

// src/prompts/prerequisites.ts
var import_picocolors4 = __toESM(require_picocolors(), 1);

// src/services/docker.ts
import { execSync, spawn, spawnSync } from "child_process";
function isDockerInstalled() {
  try {
    execSync("docker --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
function isDockerComposeV2() {
  try {
    const output = execSync("docker compose version", { stdio: "pipe" }).toString();
    return output.includes("v2");
  } catch {
    return false;
  }
}
function isDockerRunning() {
  try {
    execSync("docker info", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
function dockerComposeUp(cwd) {
  execSync("docker compose up -d --pull always", {
    cwd,
    stdio: "inherit"
  });
}
function dockerComposeDown(cwd) {
  execSync("docker compose down", {
    cwd,
    stdio: "inherit"
  });
}
function dockerComposeLogs(cwd) {
  const child = spawn("docker", ["compose", "logs", "--tail", "all", "-f"], {
    cwd,
    stdio: "inherit"
  });
  process.on("SIGINT", () => {
    child.kill("SIGINT");
  });
  child.on("exit", () => process.exit(0));
}
function dockerLogsMulti(containerNames) {
  const children = containerNames.map(
    (name) => spawn("docker", ["logs", "--tail", "all", "-f", "--timestamps", name], {
      stdio: ["ignore", "inherit", "inherit"]
    })
  );
  process.on("SIGINT", () => {
    for (const child of children) child.kill("SIGINT");
  });
  let exited = 0;
  for (const child of children) {
    child.on("exit", () => {
      exited++;
      if (exited === children.length) process.exit(0);
    });
  }
}
function dockerExecToFile(containerName, command, outputPath) {
  execSync(`docker exec ${containerName} ${command} > "${outputPath}"`, {
    stdio: "pipe",
    shell: "/bin/sh",
    maxBuffer: 1024 * 1024 * 512
  });
}
function dockerExecFromFile(containerName, command, inputPath) {
  execSync(`docker exec -i ${containerName} ${command} < "${inputPath}"`, {
    stdio: "pipe",
    shell: "/bin/sh",
    maxBuffer: 1024 * 1024 * 512
  });
}
function isContainerRunning(containerName) {
  try {
    const output = execSync(
      `docker inspect -f '{{.State.Running}}' ${containerName}`,
      { stdio: "pipe" }
    ).toString().trim();
    return output === "true";
  } catch {
    return false;
  }
}
function dockerStats(cwd) {
  return execSync(
    'docker compose stats --no-stream --format "table {{.Name}}	{{.CPUPerc}}	{{.MemUsage}}	{{.MemPerc}}	{{.NetIO}}"',
    { cwd, stdio: "pipe" }
  ).toString();
}
function dockerStatsForContainers(containerNames) {
  if (containerNames.length === 0) return "";
  return execSync(
    `docker stats --no-stream --format "table {{.Name}}	{{.CPUPerc}}	{{.MemUsage}}	{{.MemPerc}}	{{.NetIO}}" ${containerNames.join(" ")}`,
    { stdio: "pipe" }
  ).toString();
}
function getContainerLogs(containerName, lines = 50) {
  return execSync(`docker logs --tail ${lines} ${containerName}`, {
    stdio: "pipe"
  }).toString();
}
function getDockerDiskUsage() {
  return execSync("docker system df", { stdio: "pipe" }).toString();
}
function autoDetectDeploymentId() {
  try {
    const output = execSync(
      'docker ps -a --filter "name=launch-lms-app-" --format "{{.Names}}"',
      { stdio: "pipe" }
    ).toString().trim();
    if (!output) return null;
    const match = output.split("\n")[0].match(/launch-lms-app-([a-f0-9]+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
function listDeploymentContainers(deploymentId) {
  try {
    const id = deploymentId || autoDetectDeploymentId();
    if (!id) return [];
    const output = execSync(
      `docker ps -a --filter "name=launch-lms-" --format "{{.Names}}\\t{{.Status}}\\t{{.Image}}"`,
      { stdio: "pipe" }
    ).toString().trim();
    if (!output) return [];
    return output.split("\n").filter((line) => line.includes(id)).map((line) => {
      const [name, status, image] = line.split("	");
      return { name, status, image };
    });
  } catch {
    return [];
  }
}
function getContainerRestartCount(containerName) {
  try {
    const output = execSync(
      `docker inspect -f '{{.RestartCount}}' ${containerName}`,
      { stdio: "pipe" }
    ).toString().trim();
    return parseInt(output, 10) || 0;
  } catch {
    return 0;
  }
}
function dockerExecInteractive(containerName, cmd) {
  const result = spawnSync("docker", ["exec", "-it", containerName, ...cmd.split(" ")], {
    stdio: "inherit"
  });
  if (result.status !== null) {
    process.exitCode = result.status;
  }
}

// src/prompts/prerequisites.ts
async function checkPrerequisites() {
  const s = fe();
  s.start("Checking prerequisites");
  const checks = [
    {
      name: "Docker Engine",
      check: isDockerInstalled,
      failMsg: `Docker is not installed. Install it from ${import_picocolors4.default.underline("https://docs.docker.com/get-docker/")}`
    },
    {
      name: "Docker Compose v2",
      check: isDockerComposeV2,
      failMsg: `Docker Compose v2 is required. Install it from ${import_picocolors4.default.underline("https://docs.docker.com/compose/install/")}`
    },
    {
      name: "Docker daemon",
      check: isDockerRunning,
      failMsg: "Docker daemon is not running. Please start Docker and try again."
    }
  ];
  const failed = [];
  for (const { name, check, failMsg } of checks) {
    if (!check()) {
      failed.push(`${import_picocolors4.default.red("x")} ${name}: ${failMsg}`);
    }
  }
  if (failed.length > 0) {
    s.stop("Prerequisites check failed");
    O2.error("Missing prerequisites:");
    for (const msg of failed) {
      O2.message(msg);
    }
    pt("Please install the missing prerequisites and try again.");
    process.exit(1);
  }
  s.stop("All prerequisites met");
}

// src/utils/validators.ts
function validateEmail(value) {
  if (!value) return "Email is required";
  const re2 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re2.test(value)) return "Please enter a valid email address";
  return void 0;
}
function validatePassword(value) {
  if (!value) return "Password is required";
  if (value.length < 8) return "Password must be at least 8 characters";
  return void 0;
}
function validateDomain(value) {
  if (!value) return "Domain is required";
  if (value === "localhost") return void 0;
  const re2 = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  if (!re2.test(value)) return "Please enter a valid domain (e.g., launch-lms.example.com)";
  return void 0;
}
function validatePort(value) {
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 1 || num > 65535) return "Port must be between 1 and 65535";
  return void 0;
}
function validateRequired(value) {
  if (!value || value.trim() === "") return "This field is required";
  return void 0;
}

// src/prompts/domain.ts
async function promptDomain() {
  const domain = await text({
    message: "What domain will Launch LMS be hosted on?",
    placeholder: "localhost",
    defaultValue: "localhost",
    validate: validateDomain
  });
  if (q(domain)) {
    pt();
    process.exit(0);
  }
  let useHttps = false;
  let autoSsl = false;
  let sslEmail;
  if (domain !== "localhost") {
    const httpsChoice = await _t({
      message: "HTTPS configuration?",
      options: [
        { value: "auto", label: "Automatic SSL (Let's Encrypt via Caddy)", hint: "recommended" },
        { value: "manual", label: "I'll handle SSL myself (reverse proxy, Cloudflare, etc.)" },
        { value: "none", label: "No HTTPS (HTTP only)", hint: "not recommended for production" }
      ]
    });
    if (q(httpsChoice)) {
      pt();
      process.exit(0);
    }
    if (httpsChoice === "auto") {
      useHttps = true;
      autoSsl = true;
      const email = await text({
        message: "Email for Let's Encrypt notifications?",
        placeholder: "admin@example.com",
        validate: validateEmail
      });
      if (q(email)) {
        pt();
        process.exit(0);
      }
      sslEmail = email;
    } else if (httpsChoice === "manual") {
      useHttps = true;
    }
  }
  const defaultPort = autoSsl ? 443 : 80;
  const portMessage = autoSsl ? "HTTPS port? (Caddy needs 443 for auto SSL, and will also listen on 80 for redirect)" : "HTTP port for the web server?";
  const port = await text({
    message: portMessage,
    placeholder: String(defaultPort),
    defaultValue: String(defaultPort),
    validate: validatePort
  });
  if (q(port)) {
    pt();
    process.exit(0);
  }
  return {
    domain,
    useHttps,
    httpPort: parseInt(port, 10),
    autoSsl,
    sslEmail
  };
}

// src/prompts/database.ts
import crypto from "crypto";
var import_picocolors5 = __toESM(require_picocolors(), 1);

// src/utils/network.ts
import net from "net";
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}
function checkTcpConnection(host, port, timeoutMs = 5e3) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
function parsePostgresUrl(connString) {
  try {
    const url = new URL(connString);
    return { host: url.hostname, port: url.port ? parseInt(url.port, 10) : 5432 };
  } catch {
    return null;
  }
}
function parseRedisUrl(connString) {
  try {
    const url = new URL(connString);
    return { host: url.hostname, port: url.port ? parseInt(url.port, 10) : 6379 };
  } catch {
    return null;
  }
}

// src/prompts/database.ts
async function promptAndVerifyPostgres() {
  while (true) {
    const connString = await text({
      message: "PostgreSQL connection string?",
      placeholder: "postgresql://user:password@host:5432/launch-lms",
      validate: (value) => {
        const err = validateRequired(value);
        if (err) return err;
        if (!value.startsWith("postgresql://") && !value.startsWith("postgres://")) {
          return "Must start with postgresql:// or postgres://";
        }
        return void 0;
      }
    });
    if (q(connString)) {
      pt();
      process.exit(0);
    }
    const parsed = parsePostgresUrl(connString);
    if (!parsed) {
      O2.error("Could not parse the connection string. Please check the format.");
      continue;
    }
    const s = fe();
    s.start(`Checking connection to ${parsed.host}:${parsed.port}`);
    const reachable = await checkTcpConnection(parsed.host, parsed.port);
    if (reachable) {
      s.stop(`${import_picocolors5.default.green("Connected")} to ${parsed.host}:${parsed.port}`);
      return connString;
    }
    s.stop(`${import_picocolors5.default.red("Connection failed")} to ${parsed.host}:${parsed.port}`);
    const retry = await ot2({
      message: "Could not reach the database. Try a different connection string?",
      initialValue: true
    });
    if (q(retry) || !retry) {
      pt();
      process.exit(0);
    }
  }
}
async function promptAndVerifyRedis() {
  while (true) {
    const connString = await text({
      message: "Redis connection string?",
      placeholder: "redis://user:password@host:6379/0",
      validate: (value) => {
        const err = validateRequired(value);
        if (err) return err;
        if (!value.startsWith("redis://") && !value.startsWith("rediss://")) {
          return "Must start with redis:// or rediss://";
        }
        return void 0;
      }
    });
    if (q(connString)) {
      pt();
      process.exit(0);
    }
    const parsed = parseRedisUrl(connString);
    if (!parsed) {
      O2.error("Could not parse the connection string. Please check the format.");
      continue;
    }
    const s = fe();
    s.start(`Checking connection to ${parsed.host}:${parsed.port}`);
    const reachable = await checkTcpConnection(parsed.host, parsed.port);
    if (reachable) {
      s.stop(`${import_picocolors5.default.green("Connected")} to ${parsed.host}:${parsed.port}`);
      return connString;
    }
    s.stop(`${import_picocolors5.default.red("Connection failed")} to ${parsed.host}:${parsed.port}`);
    const retry = await ot2({
      message: "Could not reach Redis. Try a different connection string?",
      initialValue: true
    });
    if (q(retry) || !retry) {
      pt();
      process.exit(0);
    }
  }
}
async function promptDatabase() {
  const dbChoice = await _t({
    message: "PostgreSQL database setup?",
    options: [
      { value: "local", label: "Create a new database (Docker)", hint: "recommended" },
      { value: "external", label: "Use an external database", hint: "bring your own PostgreSQL" }
    ]
  });
  if (q(dbChoice)) {
    pt();
    process.exit(0);
  }
  let useExternalDb = false;
  let externalDbConnectionString;
  let dbPassword;
  let useAiDatabase = false;
  if (dbChoice === "external") {
    externalDbConnectionString = await promptAndVerifyPostgres();
    useExternalDb = true;
  } else {
    const dbImageChoice = await _t({
      message: "Which PostgreSQL image?",
      options: [
        { value: "ai", label: "PostgreSQL with AI capabilities", hint: "recommended \u2014 enables AI course chatbot (RAG)" },
        { value: "standard", label: "Standard PostgreSQL", hint: "lighter image, no AI search features" }
      ]
    });
    if (q(dbImageChoice)) {
      pt();
      process.exit(0);
    }
    useAiDatabase = dbImageChoice === "ai";
    dbPassword = crypto.randomBytes(24).toString("base64url");
    O2.message("");
    O2.info(import_picocolors5.default.bold("Database credentials generated:"));
    O2.message([
      "",
      `  ${import_picocolors5.default.dim("User:")}     launch-lms`,
      `  ${import_picocolors5.default.dim("Password:")} ${import_picocolors5.default.cyan(dbPassword)}`,
      `  ${import_picocolors5.default.dim("Database:")} launch-lms`,
      `  ${import_picocolors5.default.dim("Host:")}     db:5432 (internal)`,
      "",
      `  ${import_picocolors5.default.yellow("Copy the password now if needed \u2014 it will be saved in .env")}`,
      ""
    ].join("\n"));
    const ack = await ot2({ message: "Continue?", initialValue: true });
    if (q(ack) || !ack) {
      pt();
      process.exit(0);
    }
  }
  const redisChoice = await _t({
    message: "Redis setup?",
    options: [
      { value: "local", label: "Create a new Redis instance (Docker)", hint: "recommended" },
      { value: "external", label: "Use an external Redis", hint: "bring your own Redis" }
    ]
  });
  if (q(redisChoice)) {
    pt();
    process.exit(0);
  }
  let useExternalRedis = false;
  let externalRedisConnectionString;
  if (redisChoice === "external") {
    externalRedisConnectionString = await promptAndVerifyRedis();
    useExternalRedis = true;
  }
  return {
    useExternalDb,
    externalDbConnectionString,
    dbPassword,
    useAiDatabase,
    useExternalRedis,
    externalRedisConnectionString
  };
}

// src/prompts/organization.ts
async function promptOrganization() {
  const orgName = await text({
    message: "Organization name?",
    placeholder: "My School",
    defaultValue: "My School",
    validate: validateRequired
  });
  if (q(orgName)) {
    pt();
    process.exit(0);
  }
  return {
    orgName
  };
}

// src/prompts/admin.ts
async function promptAdmin() {
  const email = await text({
    message: "Admin email address?",
    placeholder: "admin@example.com",
    validate: validateEmail
  });
  if (q(email)) {
    pt();
    process.exit(0);
  }
  const password = await bt({
    message: "Admin password? (min 8 characters)",
    validate: validatePassword
  });
  if (q(password)) {
    pt();
    process.exit(0);
  }
  return {
    adminEmail: email,
    adminPassword: password
  };
}

// src/prompts/features.ts
async function promptFeatures() {
  const selected = await yt({
    message: "Enable optional features? (Space to toggle, Enter to confirm)",
    options: [
      { value: "ai", label: "AI Features (Gemini)" },
      { value: "email", label: "Email (Resend or SMTP)" },
      { value: "s3", label: "S3 Storage" },
      { value: "google", label: "Google OAuth" },
      { value: "unsplash", label: "Unsplash Images" }
    ],
    required: false
  });
  if (q(selected)) {
    pt();
    process.exit(0);
  }
  const features = selected;
  const config = {
    aiEnabled: features.includes("ai"),
    emailEnabled: features.includes("email"),
    s3Enabled: features.includes("s3"),
    googleOAuthEnabled: features.includes("google"),
    unsplashEnabled: features.includes("unsplash")
  };
  if (config.aiEnabled) {
    O2.info("Configure AI (Gemini)");
    const key = await text({
      message: "Gemini API key?",
      placeholder: "AIza...",
      validate: validateRequired
    });
    if (q(key)) {
      pt();
      process.exit(0);
    }
    config.geminiApiKey = key;
  }
  if (config.emailEnabled) {
    const provider = await _t({
      message: "Email provider?",
      options: [
        { value: "smtp", label: "SMTP (any provider)" },
        { value: "resend", label: "Resend" }
      ]
    });
    if (q(provider)) {
      pt();
      process.exit(0);
    }
    config.emailProvider = provider;
    if (config.emailProvider === "resend") {
      O2.info("Configure Email (Resend)");
      const key = await text({
        message: "Resend API key?",
        placeholder: "re_...",
        validate: validateRequired
      });
      if (q(key)) {
        pt();
        process.exit(0);
      }
      config.resendApiKey = key;
    } else {
      O2.info("Configure Email (SMTP)");
      const host = await text({
        message: "SMTP host?",
        placeholder: "smtp.gmail.com",
        validate: validateRequired
      });
      if (q(host)) {
        pt();
        process.exit(0);
      }
      config.smtpHost = host;
      const port = await text({
        message: "SMTP port?",
        initialValue: "587",
        validate: validateRequired
      });
      if (q(port)) {
        pt();
        process.exit(0);
      }
      config.smtpPort = parseInt(port, 10);
      const username = await text({
        message: "SMTP username?",
        validate: validateRequired
      });
      if (q(username)) {
        pt();
        process.exit(0);
      }
      config.smtpUsername = username;
      const password = await bt({
        message: "SMTP password?",
        validate: validateRequired
      });
      if (q(password)) {
        pt();
        process.exit(0);
      }
      config.smtpPassword = password;
      const useTls = await ot2({
        message: "Use TLS?",
        initialValue: true
      });
      if (q(useTls)) {
        pt();
        process.exit(0);
      }
      config.smtpUseTls = useTls;
    }
    const email = await text({
      message: "System email address (From)?",
      placeholder: "noreply@yourdomain.com",
      validate: validateRequired
    });
    if (q(email)) {
      pt();
      process.exit(0);
    }
    config.systemEmailAddress = email;
  }
  if (config.s3Enabled) {
    O2.info("Configure S3 Storage");
    const bucket = await text({
      message: "S3 bucket name?",
      validate: validateRequired
    });
    if (q(bucket)) {
      pt();
      process.exit(0);
    }
    config.s3BucketName = bucket;
    const endpoint = await text({
      message: "S3 endpoint URL? (leave empty for AWS S3)",
      placeholder: "https://s3.amazonaws.com"
    });
    if (q(endpoint)) {
      pt();
      process.exit(0);
    }
    if (endpoint) config.s3EndpointUrl = endpoint;
  }
  if (config.googleOAuthEnabled) {
    O2.info("Configure Google OAuth");
    const clientId = await text({
      message: "Google Client ID?",
      validate: validateRequired
    });
    if (q(clientId)) {
      pt();
      process.exit(0);
    }
    config.googleClientId = clientId;
    const clientSecret = await text({
      message: "Google Client Secret?",
      validate: validateRequired
    });
    if (q(clientSecret)) {
      pt();
      process.exit(0);
    }
    config.googleClientSecret = clientSecret;
  }
  if (config.unsplashEnabled) {
    O2.info("Configure Unsplash");
    const key = await text({
      message: "Unsplash Access Key?",
      validate: validateRequired
    });
    if (q(key)) {
      pt();
      process.exit(0);
    }
    config.unsplashAccessKey = key;
  }
  return config;
}

// src/templates/docker-compose.ts
function generateDockerCompose(config, appImage) {
  const image = appImage || APP_IMAGE;
  const id = config.deploymentId;
  const useLocalDb = !config.useExternalDb;
  const useLocalRedis = !config.useExternalRedis;
  const deps = [];
  if (useLocalDb) deps.push("      db:\n        condition: service_healthy");
  if (useLocalRedis) deps.push("      redis:\n        condition: service_healthy");
  const appDependsOn = deps.length > 0 ? `    depends_on:
${deps.join("\n")}` : "";
  const proxyService = config.autoSsl ? `
  caddy:
    image: caddy:2-alpine
    container_name: launch-lms-caddy-${id}
    restart: unless-stopped
    ports:
      - "80:80"
      - "\${HTTP_PORT:-443}:443"
    volumes:
      - ./extra/Caddyfile:/etc/caddy/Caddyfile:ro
      - launch-lms_caddy_data_${id}:/data
      - launch-lms_caddy_config_${id}:/config
    depends_on:
      launch-lms-app:
        condition: service_healthy
    networks:
      - launch-lms-network-${id}
    healthcheck:
      test: ["CMD-SHELL", "wget --quiet --tries=1 --spider http://localhost:80/ || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
` : `
  nginx:
    image: nginx:alpine
    container_name: launch-lms-nginx-${id}
    restart: unless-stopped
    ports:
      - "\${HTTP_PORT:-80}:80"
    volumes:
      - ./extra/nginx.prod.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      launch-lms-app:
        condition: service_healthy
    networks:
      - launch-lms-network-${id}
    healthcheck:
      test: ["CMD-SHELL", "wget --quiet --tries=1 --spider http://localhost/ || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
`;
  const dbImage = config.useAiDatabase ? POSTGRES_AI_IMAGE : POSTGRES_IMAGE;
  const dbService = useLocalDb ? `
  db:
    image: ${dbImage}
    container_name: launch-lms-db-${id}
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - POSTGRES_USER=\${POSTGRES_USER:-launch-lms}
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD:-launch-lms}
      - POSTGRES_DB=\${POSTGRES_DB:-launch-lms}
    volumes:
      - launch-lms_db_data_${id}:/var/lib/postgresql/data
    networks:
      - launch-lms-network-${id}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-launch-lms}"]
      interval: 5s
      timeout: 4s
      retries: 5
` : "";
  const redisService = useLocalRedis ? `
  redis:
    image: redis:7.2.3-alpine
    container_name: launch-lms-redis-${id}
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - launch-lms_redis_data_${id}:/data
    networks:
      - launch-lms-network-${id}
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 4s
      retries: 5
` : "";
  const volumeEntries = [];
  if (config.autoSsl) {
    volumeEntries.push(`  launch-lms_caddy_data_${id}:`);
    volumeEntries.push(`  launch-lms_caddy_config_${id}:`);
  }
  if (useLocalDb) volumeEntries.push(`  launch-lms_db_data_${id}:`);
  if (useLocalRedis) volumeEntries.push(`  launch-lms_redis_data_${id}:`);
  const volumesSection = volumeEntries.length > 0 ? `volumes:
${volumeEntries.join("\n")}` : "";
  return `name: launch-lms-${id}

services:
  launch-lms-app:
    image: ${image}
    container_name: launch-lms-app-${id}
    restart: unless-stopped
    env_file:
      - .env
    environment:
      # HOSTNAME needs to be set explicitly for the container
      - HOSTNAME=0.0.0.0
      - LAUNCHLMS_API_URL=http://localhost:9000
${appDependsOn}
    networks:
      - launch-lms-network-${id}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
${proxyService}${dbService}${redisService}
networks:
  launch-lms-network-${id}:
    driver: bridge

${volumesSection}
`;
}

// src/templates/env.ts
import crypto2 from "crypto";
function generateSecret() {
  return crypto2.randomBytes(32).toString("base64");
}
function generateEnvFile(config) {
  const protocol = config.useHttps ? "https" : "http";
  const portSuffix = config.useHttps && config.httpPort === 443 || !config.useHttps && config.httpPort === 80 ? "" : `:${config.httpPort}`;
  const baseUrl = `${protocol}://${config.domain}${portSuffix}`;
  const domainWithPort = `${config.domain}${portSuffix}`;
  const topDomain = config.domain === "localhost" ? "localhost" : config.domain.split(".").slice(-2).join(".");
  const cookieDomain = config.domain === "localhost" ? ".localhost" : `.${topDomain}`;
  const nextAuthSecret = generateSecret();
  const jwtSecret = generateSecret();
  const collabInternalKey = generateSecret();
  const lines = [
    "# Launch LMS Environment Variables",
    "# Generated by Launch LMS CLI",
    "",
    "# =============================================================================",
    "# Domain & Hosting Configuration",
    "# =============================================================================",
    "",
    `LAUNCHLMS_DOMAIN=${domainWithPort}`,
    `HTTP_PORT=${config.httpPort}`,
    "",
    "# =============================================================================",
    "# Frontend Environment Variables (NEXT_PUBLIC_*)",
    "# =============================================================================",
    "",
    `NEXT_PUBLIC_LAUNCHLMS_API_URL=${baseUrl}/api/v1/`,
    `NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL=${baseUrl}/`,
    `NEXT_PUBLIC_LAUNCHLMS_DOMAIN=${domainWithPort}`,
    `NEXT_PUBLIC_LAUNCHLMS_TOP_DOMAIN=${topDomain}`,
    "NEXT_PUBLIC_LAUNCHLMS_MULTI_ORG=False",
    "NEXT_PUBLIC_LAUNCHLMS_DEFAULT_ORG=default",
    `NEXT_PUBLIC_LAUNCHLMS_HTTPS=${config.useHttps ? "True" : "False"}`
  ];
  if (config.unsplashEnabled && config.unsplashAccessKey) {
    lines.push(`NEXT_PUBLIC_UNSPLASH_ACCESS_KEY=${config.unsplashAccessKey}`);
  }
  lines.push(
    "",
    "# =============================================================================",
    "# NextAuth Configuration",
    "# =============================================================================",
    "",
    `NEXTAUTH_URL=${baseUrl}`,
    `NEXTAUTH_SECRET=${nextAuthSecret}`
  );
  if (config.googleOAuthEnabled && config.googleClientId && config.googleClientSecret) {
    lines.push(
      `LAUNCHLMS_GOOGLE_CLIENT_ID=${config.googleClientId}`,
      `LAUNCHLMS_GOOGLE_CLIENT_SECRET=${config.googleClientSecret}`
    );
  }
  lines.push(
    "",
    "# =============================================================================",
    "# Backend Configuration",
    "# =============================================================================",
    "",
    `LAUNCHLMS_SQL_CONNECTION_STRING=${config.useExternalDb ? config.externalDbConnectionString : `postgresql://launch-lms:${config.dbPassword}@db:5432/launch-lms`}`,
    `LAUNCHLMS_REDIS_CONNECTION_STRING=${config.useExternalRedis ? config.externalRedisConnectionString : "redis://redis:6379/launch-lms"}`,
    `LAUNCHLMS_COOKIE_DOMAIN=${cookieDomain}`,
    "LAUNCHLMS_PORT=9000",
    "",
    "# =============================================================================",
    "# Security",
    "# =============================================================================",
    "",
    `LAUNCHLMS_AUTH_JWT_SECRET_KEY=${jwtSecret}`,
    `LAUNCHLMS_INITIAL_ADMIN_EMAIL=${config.adminEmail}`,
    `LAUNCHLMS_INITIAL_ADMIN_PASSWORD=${config.adminPassword}`,
    "",
    "# =============================================================================",
    "# Collaboration Server",
    "# =============================================================================",
    "",
    `COLLAB_INTERNAL_KEY=${collabInternalKey}`,
    `LAUNCHLMS_REDIS_URL=${config.useExternalRedis ? config.externalRedisConnectionString : "redis://redis:6379"}`,
    `NEXT_PUBLIC_COLLAB_URL=${config.useHttps ? "wss" : "ws"}://${config.domain}${portSuffix}/collab`,
    "",
    "# =============================================================================",
    "# General Settings",
    "# =============================================================================",
    "",
    "LAUNCHLMS_DEVELOPMENT_MODE=False",
    "LAUNCHLMS_LOGFIRE_ENABLED=False"
  );
  if (config.aiEnabled && config.geminiApiKey) {
    lines.push(
      "",
      "# =============================================================================",
      "# AI Configuration",
      "# =============================================================================",
      "",
      `LAUNCHLMS_GEMINI_API_KEY=${config.geminiApiKey}`,
      "LAUNCHLMS_IS_AI_ENABLED=True"
    );
  } else {
    lines.push(
      "",
      "# =============================================================================",
      "# AI Configuration",
      "# =============================================================================",
      "",
      "LAUNCHLMS_IS_AI_ENABLED=False"
    );
  }
  if (config.emailEnabled) {
    const provider = config.emailProvider || "resend";
    lines.push(
      "",
      "# =============================================================================",
      "# Email Configuration",
      "# =============================================================================",
      "",
      `LAUNCHLMS_EMAIL_PROVIDER=${provider}`,
      `LAUNCHLMS_SYSTEM_EMAIL_ADDRESS=${config.systemEmailAddress || `noreply@${config.domain}`}`
    );
    if (provider === "resend" && config.resendApiKey) {
      lines.push(`LAUNCHLMS_RESEND_API_KEY=${config.resendApiKey}`);
    }
    if (provider === "smtp") {
      if (config.smtpHost) lines.push(`LAUNCHLMS_SMTP_HOST=${config.smtpHost}`);
      lines.push(`LAUNCHLMS_SMTP_PORT=${config.smtpPort || 587}`);
      if (config.smtpUsername) lines.push(`LAUNCHLMS_SMTP_USERNAME=${config.smtpUsername}`);
      if (config.smtpPassword) lines.push(`LAUNCHLMS_SMTP_PASSWORD=${config.smtpPassword}`);
      lines.push(`LAUNCHLMS_SMTP_USE_TLS=${config.smtpUseTls !== false ? "True" : "False"}`);
    }
  }
  if (config.s3Enabled && config.s3BucketName) {
    lines.push(
      "",
      "# =============================================================================",
      "# Content Delivery",
      "# =============================================================================",
      "",
      "LAUNCHLMS_CONTENT_DELIVERY_TYPE=s3api",
      `LAUNCHLMS_S3_API_BUCKET_NAME=${config.s3BucketName}`
    );
    if (config.s3EndpointUrl) {
      lines.push(`LAUNCHLMS_S3_API_ENDPOINT_URL=${config.s3EndpointUrl}`);
    }
  } else {
    lines.push(
      "",
      "# =============================================================================",
      "# Content Delivery",
      "# =============================================================================",
      "",
      "LAUNCHLMS_CONTENT_DELIVERY_TYPE=filesystem"
    );
  }
  if (!config.useExternalDb) {
    lines.push(
      "",
      "# =============================================================================",
      "# Database Configuration",
      "# =============================================================================",
      "",
      "POSTGRES_USER=launch-lms",
      `POSTGRES_PASSWORD=${config.dbPassword}`,
      "POSTGRES_DB=launch-lms",
      ""
    );
  } else {
    lines.push("");
  }
  return lines.join("\n");
}

// src/templates/nginx.ts
function generateNginxConf() {
  return `
server {
    listen 80;
    server_name _;
    client_max_body_size 500M;

    # Increase header buffer size
    large_client_header_buffers 4 32k;

    # Increase the maximum allowed size of the client request body
    client_body_buffer_size 32k;

    # Increase the maximum allowed size of the client request header fields
    client_header_buffer_size 32k;

    # Proxy all requests to the launch-lms-app service
    # The app container has internal nginx routing between frontend, backend, and collab
    location / {
        proxy_pass http://launch-lms-app:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (needed for /collab)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts for long-running requests and WebSocket connections
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_connect_timeout 75s;
    }
}
`;
}

// src/templates/caddyfile.ts
function generateCaddyfile(config) {
  const email = config.sslEmail || "admin@example.com";
  return `{
  email ${email}
}

${config.domain} {
  reverse_proxy launch-lms-app:80
}
`;
}

// src/services/config-store.ts
import fs from "fs";
import path from "path";
function writeConfig(config) {
  const data = {
    version: VERSION,
    deploymentId: config.deploymentId,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    installDir: config.installDir,
    domain: config.domain,
    httpPort: config.httpPort,
    useHttps: config.useHttps,
    autoSsl: config.autoSsl,
    useExternalDb: config.useExternalDb,
    orgSlug: "default"
  };
  fs.writeFileSync(
    path.join(config.installDir, CONFIG_FILENAME),
    JSON.stringify(data, null, 2) + "\n"
  );
}
function readConfig(dir) {
  const configPath = path.join(dir || process.cwd(), CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}
function isCompleteInstall(dir) {
  const configPath = path.join(dir, CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) return false;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return !!config.deploymentId && fs.existsSync(path.join(dir, ".env"));
  } catch {
    return false;
  }
}
function collectCandidates(dir, depth, results) {
  if (depth < 0) return;
  if (fs.existsSync(path.join(dir, CONFIG_FILENAME))) {
    results.push(dir);
  }
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist" || entry.name === "backups") continue;
      collectCandidates(path.join(dir, entry.name), depth - 1, results);
    }
  } catch {
  }
}
function pickBest(candidates) {
  if (candidates.length === 0) return null;
  const completeInstalls = candidates.filter(isCompleteInstall);
  if (completeInstalls.length > 0) {
    completeInstalls.sort((a, b) => {
      try {
        const configA = JSON.parse(fs.readFileSync(path.join(a, CONFIG_FILENAME), "utf-8"));
        const configB = JSON.parse(fs.readFileSync(path.join(b, CONFIG_FILENAME), "utf-8"));
        return (configB.createdAt || "").localeCompare(configA.createdAt || "");
      } catch {
        return 0;
      }
    });
    return completeInstalls[0];
  }
  return candidates[0];
}
function findInstallDir() {
  const cwd = process.cwd();
  if (isCompleteInstall(cwd)) return cwd;
  const subDir = path.join(cwd, "launch-lms");
  if (isCompleteInstall(subDir)) return subDir;
  const candidates = [];
  collectCandidates(cwd, 10, candidates);
  const best = pickBest(candidates);
  if (best) return best;
  let current = cwd;
  let fallbackDir = null;
  while (true) {
    const parent = path.dirname(current);
    if (parent === current) break;
    if (isCompleteInstall(parent)) return parent;
    const parentSub = path.join(parent, "launch-lms");
    if (isCompleteInstall(parentSub)) return parentSub;
    if (!fallbackDir && fs.existsSync(path.join(parent, CONFIG_FILENAME))) {
      fallbackDir = parent;
    }
    current = parent;
  }
  if (fallbackDir) return fallbackDir;
  return cwd;
}

// src/services/health.ts
async function waitForHealth(baseUrl) {
  const url = `${baseUrl}/api/v1/health`;
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5e3) });
      if (res.ok) return true;
    } catch {
    }
    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
  }
  return false;
}

// src/commands/setup.ts
var STEP_NAMES = [
  "Install Directory",
  "Domain Configuration",
  "Database & Redis",
  "Organization Setup",
  "Admin Account",
  "Optional Features"
];
var BACK = /* @__PURE__ */ Symbol("back");
async function confirmOrBack(message) {
  if (STEP_NAMES.length === 0) return true;
  const result = await _t({
    message,
    options: [
      { value: "continue", label: "Continue" },
      { value: "back", label: import_picocolors6.default.dim("Go back to previous step") }
    ]
  });
  if (q(result)) {
    pt();
    process.exit(0);
  }
  return result === "back" ? BACK : true;
}
async function stepInstallDir() {
  const defaultDir = fs2.existsSync(path2.join(process.cwd(), "launch-lms", "launch-lms.config.json")) ? "./launch-lms-new" : "./launch-lms";
  const installDir = await text({
    message: "Where should Launch LMS be installed?",
    placeholder: defaultDir,
    defaultValue: defaultDir
  });
  if (q(installDir)) {
    pt();
    process.exit(0);
  }
  const resolved = path2.resolve(installDir);
  if (fs2.existsSync(path2.join(resolved, "launch-lms.config.json"))) {
    O2.warn(`${resolved} already contains a Launch LMS installation.`);
    const overwrite = await ot2({
      message: "Overwrite existing installation?",
      initialValue: false
    });
    if (q(overwrite) || !overwrite) {
      pt("Setup cancelled.");
      process.exit(0);
    }
  }
  return resolved;
}
async function stepDomain() {
  O2.step(import_picocolors6.default.cyan(`Step 2/6`) + " Domain Configuration");
  const config = await promptDomain();
  const portAvailable = await checkPort(config.httpPort);
  if (!portAvailable) {
    O2.warn(`Port ${config.httpPort} is already in use. You may need to free it before starting.`);
  }
  return config;
}
async function stepDatabase() {
  O2.step(import_picocolors6.default.cyan(`Step 3/6`) + " Database & Redis");
  return await promptDatabase();
}
async function stepOrganization() {
  O2.step(import_picocolors6.default.cyan(`Step 4/6`) + " Organization Setup");
  return await promptOrganization();
}
async function stepAdmin() {
  O2.step(import_picocolors6.default.cyan(`Step 5/6`) + " Admin Account");
  return await promptAdmin();
}
async function stepFeatures() {
  O2.step(import_picocolors6.default.cyan(`Step 6/6`) + " Optional Features");
  return await promptFeatures();
}
async function setupCommand() {
  await printBanner();
  mt(import_picocolors6.default.cyan("Launch LMS Setup Wizard"));
  await checkPrerequisites();
  const channelChoice = await _t({
    message: "Which release channel do you want to use?",
    options: [
      {
        value: "stable",
        label: "Stable",
        hint: "recommended \u2014 versioned release or :latest"
      },
      {
        value: "dev",
        label: "Dev",
        hint: "latest development build (:dev tag)"
      }
    ]
  });
  if (q(channelChoice)) {
    pt();
    process.exit(0);
  }
  const channel = channelChoice;
  let resolvedDir = "";
  let domainConfig = null;
  let dbConfig = null;
  let orgConfig = null;
  let adminConfig = null;
  let featuresConfig = null;
  let step = 0;
  const totalSteps = STEP_NAMES.length;
  while (step < totalSteps) {
    switch (step) {
      case 0: {
        O2.step(import_picocolors6.default.cyan(`Step 1/${totalSteps}`) + " Install Directory");
        const result = await stepInstallDir();
        if (result === BACK) {
          step = Math.max(0, step - 1);
          break;
        }
        resolvedDir = result;
        step++;
        break;
      }
      case 1: {
        domainConfig = await stepDomain();
        const nav = await confirmOrBack("Domain configured. Continue?");
        if (nav === BACK) {
          step--;
          break;
        }
        step++;
        break;
      }
      case 2: {
        dbConfig = await stepDatabase();
        const nav = await confirmOrBack("Database configured. Continue?");
        if (nav === BACK) {
          step--;
          break;
        }
        step++;
        break;
      }
      case 3: {
        orgConfig = await stepOrganization();
        const nav = await confirmOrBack("Organization configured. Continue?");
        if (nav === BACK) {
          step--;
          break;
        }
        step++;
        break;
      }
      case 4: {
        adminConfig = await stepAdmin();
        const nav = await confirmOrBack("Admin account configured. Continue?");
        if (nav === BACK) {
          step--;
          break;
        }
        step++;
        break;
      }
      case 5: {
        featuresConfig = await stepFeatures();
        step++;
        break;
      }
    }
  }
  const deploymentId = crypto3.randomBytes(4).toString("hex");
  const config = {
    deploymentId,
    installDir: resolvedDir,
    channel,
    ...domainConfig,
    ...dbConfig,
    ...orgConfig,
    ...adminConfig,
    ...featuresConfig
  };
  const protocol = config.useHttps ? "https" : "http";
  const portSuffix = config.useHttps && config.httpPort === 443 || !config.useHttps && config.httpPort === 80 ? "" : `:${config.httpPort}`;
  const url = `${protocol}://${config.domain}${portSuffix}`;
  O2.step("Configuration Summary");
  O2.message([
    `  ${import_picocolors6.default.dim("Directory:")}     ${resolvedDir}`,
    `  ${import_picocolors6.default.dim("Channel:")}       ${config.channel === "dev" ? import_picocolors6.default.yellow("Dev (:dev)") : import_picocolors6.default.green("Stable")}`,
    `  ${import_picocolors6.default.dim("URL:")}           ${url}`,
    `  ${import_picocolors6.default.dim("HTTPS:")}         ${config.autoSsl ? "Auto SSL (Caddy)" : config.useHttps ? "Manual" : "Disabled"}`,
    `  ${import_picocolors6.default.dim("Database:")}      ${config.useExternalDb ? "External" : config.useAiDatabase ? "Local (Docker, AI-enabled)" : "Local (Docker)"}`,
    `  ${import_picocolors6.default.dim("Redis:")}         ${config.useExternalRedis ? "External" : "Local (Docker)"}`,
    `  ${import_picocolors6.default.dim("Organization:")} ${config.orgName}`,
    `  ${import_picocolors6.default.dim("Admin:")}        ${config.adminEmail}`,
    `  ${import_picocolors6.default.dim("AI:")}           ${config.aiEnabled ? "Enabled" : "Disabled"}`,
    `  ${import_picocolors6.default.dim("Email:")}        ${config.emailEnabled ? "Enabled" : "Disabled"}`,
    `  ${import_picocolors6.default.dim("S3 Storage:")}   ${config.s3Enabled ? "Enabled" : "Disabled"}`,
    `  ${import_picocolors6.default.dim("Google OAuth:")} ${config.googleOAuthEnabled ? "Enabled" : "Disabled"}`,
    `  ${import_picocolors6.default.dim("Unsplash:")}     ${config.unsplashEnabled ? "Enabled" : "Disabled"}`
  ].join("\n"));
  let confirmed = false;
  while (!confirmed) {
    const action = await _t({
      message: "What would you like to do?",
      options: [
        { value: "confirm", label: "Proceed with this configuration" },
        { value: "edit", label: import_picocolors6.default.dim("Go back and edit a step") },
        { value: "cancel", label: import_picocolors6.default.dim("Cancel setup") }
      ]
    });
    if (q(action) || action === "cancel") {
      pt("Setup cancelled.");
      process.exit(0);
    }
    if (action === "edit") {
      const stepChoice = await _t({
        message: "Which step do you want to edit?",
        options: STEP_NAMES.map((name, i) => ({ value: i, label: `${i + 1}. ${name}` }))
      });
      if (q(stepChoice)) continue;
      const idx = stepChoice;
      switch (idx) {
        case 0: {
          O2.step(import_picocolors6.default.cyan(`Step 1/${totalSteps}`) + " Install Directory");
          const result = await stepInstallDir();
          if (result !== BACK) {
            resolvedDir = result;
            config.installDir = result;
          }
          break;
        }
        case 1: {
          domainConfig = await stepDomain();
          Object.assign(config, domainConfig);
          break;
        }
        case 2: {
          dbConfig = await stepDatabase();
          Object.assign(config, dbConfig);
          break;
        }
        case 3: {
          orgConfig = await stepOrganization();
          Object.assign(config, orgConfig);
          break;
        }
        case 4: {
          adminConfig = await stepAdmin();
          Object.assign(config, adminConfig);
          break;
        }
        case 5: {
          featuresConfig = await stepFeatures();
          Object.assign(config, featuresConfig);
          break;
        }
      }
      const p2 = config.useHttps ? "https" : "http";
      const ps2 = config.useHttps && config.httpPort === 443 || !config.useHttps && config.httpPort === 80 ? "" : `:${config.httpPort}`;
      const url2 = `${p2}://${config.domain}${ps2}`;
      O2.step("Updated Configuration Summary");
      O2.message([
        `  ${import_picocolors6.default.dim("Directory:")}     ${config.installDir}`,
        `  ${import_picocolors6.default.dim("Channel:")}       ${config.channel === "dev" ? import_picocolors6.default.yellow("Dev (:dev)") : import_picocolors6.default.green("Stable")}`,
        `  ${import_picocolors6.default.dim("URL:")}           ${url2}`,
        `  ${import_picocolors6.default.dim("HTTPS:")}         ${config.autoSsl ? "Auto SSL (Caddy)" : config.useHttps ? "Manual" : "Disabled"}`,
        `  ${import_picocolors6.default.dim("Database:")}      ${config.useExternalDb ? "External" : config.useAiDatabase ? "Local (Docker, AI-enabled)" : "Local (Docker)"}`,
        `  ${import_picocolors6.default.dim("Redis:")}         ${config.useExternalRedis ? "External" : "Local (Docker)"}`,
        `  ${import_picocolors6.default.dim("Organization:")} ${config.orgName}`,
        `  ${import_picocolors6.default.dim("Admin:")}        ${config.adminEmail}`,
        `  ${import_picocolors6.default.dim("AI:")}           ${config.aiEnabled ? "Enabled" : "Disabled"}`,
        `  ${import_picocolors6.default.dim("Email:")}        ${config.emailEnabled ? "Enabled" : "Disabled"}`,
        `  ${import_picocolors6.default.dim("S3 Storage:")}   ${config.s3Enabled ? "Enabled" : "Disabled"}`,
        `  ${import_picocolors6.default.dim("Google OAuth:")} ${config.googleOAuthEnabled ? "Enabled" : "Disabled"}`,
        `  ${import_picocolors6.default.dim("Unsplash:")}     ${config.unsplashEnabled ? "Enabled" : "Disabled"}`
      ].join("\n"));
    } else {
      confirmed = true;
    }
  }
  const s0 = fe();
  s0.start("Resolving Launch LMS image version");
  const { image: appImage, isLatest } = await resolveAppImage(config.channel);
  s0.stop(`Using image: ${appImage}`);
  if (isLatest) {
    O2.warn("No versioned image found \u2014 using :latest tag. Pin to a version for stability.");
  }
  const s = fe();
  s.start("Generating configuration files");
  const finalDir = config.installDir;
  try {
    fs2.mkdirSync(finalDir, { recursive: true });
    fs2.mkdirSync(path2.join(finalDir, "extra"), { recursive: true });
    fs2.writeFileSync(path2.join(finalDir, "docker-compose.yml"), generateDockerCompose(config, appImage));
    fs2.writeFileSync(path2.join(finalDir, ".env"), generateEnvFile(config));
    if (config.autoSsl) {
      fs2.writeFileSync(path2.join(finalDir, "extra", "Caddyfile"), generateCaddyfile(config));
    } else {
      fs2.writeFileSync(path2.join(finalDir, "extra", "nginx.prod.conf"), generateNginxConf());
    }
    writeConfig(config);
  } catch (err) {
    s.stop("Failed to generate configuration files");
    O2.error(err?.message ?? String(err));
    process.exit(1);
  }
  s.stop("Configuration files generated");
  const startNow = await ot2({
    message: "Start Launch LMS now?",
    initialValue: true
  });
  if (q(startNow)) {
    pt();
    process.exit(0);
  }
  const finalProtocol = config.useHttps ? "https" : "http";
  const finalPortSuffix = config.useHttps && config.httpPort === 443 || !config.useHttps && config.httpPort === 80 ? "" : `:${config.httpPort}`;
  const finalUrl = `${finalProtocol}://${config.domain}${finalPortSuffix}`;
  if (startNow) {
    O2.step("Starting Launch LMS");
    const s2 = fe();
    s2.start("Pulling images and starting services (this may take a few minutes)");
    try {
      dockerComposeUp(finalDir);
      s2.stop("Services started");
    } catch (err) {
      s2.stop("Failed to start services");
      O2.error("Docker Compose failed. Check the output above for details.");
      O2.info(`You can manually start with: cd ${finalDir} && docker compose up -d`);
      process.exit(1);
    }
    const s3 = fe();
    s3.start("Waiting for Launch LMS to be ready (up to 3 minutes)");
    const healthy = await waitForHealth(`http://localhost:${config.httpPort}`);
    if (healthy) {
      s3.stop("Launch LMS is ready!");
    } else {
      s3.stop("Health check timed out");
      O2.warn("Launch LMS may still be starting. Check status with:");
      O2.message(`  cd ${finalDir} && docker compose ps`);
    }
    O2.success(import_picocolors6.default.green(import_picocolors6.default.bold("Launch LMS is installed!")));
    O2.message([
      "",
      `  ${import_picocolors6.default.cyan("URL:")}       ${finalUrl}`,
      `  ${import_picocolors6.default.cyan("Admin:")}     ${config.adminEmail}`,
      `  ${import_picocolors6.default.cyan("Password:")}  ${config.adminPassword}`,
      "",
      `  ${import_picocolors6.default.dim("Management commands:")}`,
      `  ${import_picocolors6.default.dim("$")} ${LOCAL_CLI_COMMAND} start    ${import_picocolors6.default.dim("Start services")}`,
      `  ${import_picocolors6.default.dim("$")} ${LOCAL_CLI_COMMAND} stop     ${import_picocolors6.default.dim("Stop services")}`,
      `  ${import_picocolors6.default.dim("$")} ${LOCAL_CLI_COMMAND} logs     ${import_picocolors6.default.dim("View logs")}`,
      `  ${import_picocolors6.default.dim("$")} ${LOCAL_CLI_COMMAND} config   ${import_picocolors6.default.dim("Show configuration")}`,
      `  ${import_picocolors6.default.dim("$")} ${LOCAL_CLI_COMMAND} backup   ${import_picocolors6.default.dim("Backup & restore")}`,
      `  ${import_picocolors6.default.dim("$")} ${LOCAL_CLI_COMMAND} deployments ${import_picocolors6.default.dim("Manage deployments")}`,
      `  ${import_picocolors6.default.dim("$")} ${LOCAL_CLI_COMMAND} doctor   ${import_picocolors6.default.dim("Diagnose issues")}`,
      `  ${import_picocolors6.default.dim("$")} ${LOCAL_CLI_COMMAND} shell    ${import_picocolors6.default.dim("Container shell")}`,
      ""
    ].join("\n"));
  } else {
    O2.info(`Files have been generated in ${finalDir}`);
    O2.message(`  Start later with: cd ${finalDir} && docker compose up -d`);
  }
  gt(import_picocolors6.default.dim("Happy teaching!"));
}

// src/commands/start.ts
var import_picocolors7 = __toESM(require_picocolors(), 1);
async function startCommand() {
  const dir = findInstallDir();
  const config = readConfig(dir);
  if (!config) {
    O2.error("No Launch LMS installation found in the current directory.");
    O2.info(`Run \`${LOCAL_CLI_COMMAND} setup\` to set up a new installation.`);
    process.exit(1);
  }
  mt(import_picocolors7.default.cyan("Starting Launch LMS"));
  try {
    dockerComposeUp(config.installDir);
    O2.success("Launch LMS is running!");
  } catch {
    O2.error("Failed to start services. Check Docker output above.");
    process.exit(1);
  }
}

// src/commands/stop.ts
var import_picocolors8 = __toESM(require_picocolors(), 1);
async function stopCommand() {
  const dir = findInstallDir();
  const config = readConfig(dir);
  if (!config) {
    O2.error("No Launch LMS installation found in the current directory.");
    process.exit(1);
  }
  mt(import_picocolors8.default.cyan("Stopping Launch LMS"));
  try {
    dockerComposeDown(config.installDir);
    O2.success("Launch LMS stopped.");
  } catch {
    O2.error("Failed to stop services. Check Docker output above.");
    process.exit(1);
  }
}

// src/commands/logs.ts
async function logsCommand() {
  const dir = findInstallDir();
  const config = readConfig(dir);
  O2.info("Streaming logs (Ctrl+C to stop)...");
  if (config?.installDir) {
    try {
      const { execSync: execSync7 } = await import("child_process");
      const ps = execSync7("docker compose ps -q", { cwd: config.installDir, stdio: "pipe" }).toString().trim();
      if (ps) {
        dockerComposeLogs(config.installDir);
        return;
      }
    } catch {
    }
  }
  const id = config?.deploymentId || autoDetectDeploymentId();
  if (!id) {
    O2.error("No Launch LMS containers found. Start services first.");
    process.exit(1);
  }
  const containers = listDeploymentContainers(id).filter((c2) => c2.status.toLowerCase().startsWith("up"));
  if (containers.length === 0) {
    O2.error("No running containers found. Start services first.");
    process.exit(1);
  }
  dockerLogsMulti(containers.map((c2) => c2.name));
}

// src/commands/config.ts
var import_picocolors9 = __toESM(require_picocolors(), 1);
async function configCommand() {
  const dir = findInstallDir();
  const config = readConfig(dir);
  if (!config) {
    O2.error("No Launch LMS installation found in the current directory.");
    process.exit(1);
  }
  mt(import_picocolors9.default.cyan("Launch LMS Configuration"));
  const protocol = config.useHttps ? "https" : "http";
  const portSuffix = config.useHttps && config.httpPort === 443 || !config.useHttps && config.httpPort === 80 ? "" : `:${config.httpPort}`;
  O2.message([
    `  ${import_picocolors9.default.dim("Version:")}      ${config.version}`,
    `  ${import_picocolors9.default.dim("Created:")}      ${config.createdAt}`,
    `  ${import_picocolors9.default.dim("Directory:")}    ${config.installDir}`,
    `  ${import_picocolors9.default.dim("URL:")}          ${protocol}://${config.domain}${portSuffix}`,
    `  ${import_picocolors9.default.dim("Org slug:")}     ${config.orgSlug}`
  ].join("\n"));
  O2.info(import_picocolors9.default.dim(`Full config: ${dir}/launch-lms.config.json`));
  O2.info(import_picocolors9.default.dim(`Environment: ${config.installDir}/.env (contains secrets)`));
}

// src/commands/backup.ts
import fs3 from "fs";
import path3 from "path";
import { execSync as execSync2 } from "child_process";
var import_picocolors10 = __toESM(require_picocolors(), 1);
function resolveDbContainer(config) {
  const id = config.deploymentId || autoDetectDeploymentId();
  if (!id) return null;
  return `launch-lms-db-${id}`;
}
async function createBackup() {
  const installDir = findInstallDir();
  const config = readConfig(installDir);
  if (!config) {
    O2.error("No Launch LMS installation found. Run setup first.");
    process.exit(1);
  }
  if (config.useExternalDb) {
    O2.error("Backup is only supported for local (Docker) databases.");
    O2.info("For external databases, use your database provider's backup tools.");
    process.exit(1);
  }
  const dbContainer = resolveDbContainer(config);
  if (!dbContainer || !isContainerRunning(dbContainer)) {
    O2.error("Database container is not running. Start services first.");
    process.exit(1);
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const backupDir = path3.join(installDir, "backups");
  const backupName = `launch-lms-backup-${timestamp}`;
  const tmpDir = path3.join(backupDir, backupName);
  const archivePath = path3.join(backupDir, `${backupName}.tar.gz`);
  fs3.mkdirSync(tmpDir, { recursive: true });
  const s = fe();
  s.start("Creating database dump");
  try {
    const dumpPath = path3.join(tmpDir, "database.sql");
    dockerExecToFile(
      dbContainer,
      "pg_dump -U launch-lms launch-lms",
      dumpPath
    );
    s.stop("Database dump created");
  } catch (err) {
    s.stop("Database dump failed");
    O2.error("Failed to create database dump. Check that the database is running.");
    fs3.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }
  const envPath = path3.join(installDir, ".env");
  if (fs3.existsSync(envPath)) {
    fs3.copyFileSync(envPath, path3.join(tmpDir, ".env"));
  }
  const s2 = fe();
  s2.start("Creating archive");
  try {
    execSync2(`tar -czf "${archivePath}" -C "${backupDir}" "${backupName}"`, {
      stdio: "pipe"
    });
    s2.stop("Archive created");
  } catch {
    s2.stop("Archive creation failed");
    O2.error("Failed to create archive.");
    process.exit(1);
  }
  fs3.rmSync(tmpDir, { recursive: true, force: true });
  const stats = fs3.statSync(archivePath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
  O2.success(import_picocolors10.default.green(import_picocolors10.default.bold("Backup complete!")));
  O2.message([
    "",
    `  ${import_picocolors10.default.dim("File:")} ${archivePath}`,
    `  ${import_picocolors10.default.dim("Size:")} ${sizeMb} MB`,
    "",
    `  ${import_picocolors10.default.dim("Restore with:")} ${LOCAL_CLI_COMMAND} backup --restore ${archivePath}`,
    ""
  ].join("\n"));
}
async function restoreBackup(archivePath) {
  if (!fs3.existsSync(archivePath)) {
    O2.error(`Backup file not found: ${archivePath}`);
    process.exit(1);
  }
  const installDir = findInstallDir();
  const config = readConfig(installDir);
  if (!config) {
    O2.error("No Launch LMS installation found. Run setup first.");
    process.exit(1);
  }
  if (config.useExternalDb) {
    O2.error("Restore is only supported for local (Docker) databases.");
    O2.info("For external databases, use your database provider's restore tools.");
    process.exit(1);
  }
  const dbContainer = resolveDbContainer(config);
  if (!dbContainer || !isContainerRunning(dbContainer)) {
    O2.error("Database container is not running. Start services first.");
    process.exit(1);
  }
  O2.warn(import_picocolors10.default.yellow("This will overwrite the current database with the backup data."));
  const confirm = await ot2({
    message: "Are you sure you want to restore from this backup?",
    initialValue: false
  });
  if (q(confirm) || !confirm) {
    pt("Restore cancelled.");
    process.exit(0);
  }
  const tmpDir = path3.join(installDir, ".restore-tmp");
  fs3.mkdirSync(tmpDir, { recursive: true });
  const s = fe();
  s.start("Extracting backup archive");
  try {
    execSync2(`tar -xzf "${archivePath}" -C "${tmpDir}"`, { stdio: "pipe" });
    s.stop("Archive extracted");
  } catch {
    s.stop("Extraction failed");
    fs3.rmSync(tmpDir, { recursive: true, force: true });
    O2.error("Failed to extract backup archive.");
    process.exit(1);
  }
  const entries = fs3.readdirSync(tmpDir);
  const backupFolder = entries.find(
    (e) => fs3.existsSync(path3.join(tmpDir, e, "database.sql"))
  );
  if (!backupFolder) {
    O2.error("No database.sql found in the backup archive.");
    fs3.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }
  const dumpPath = path3.join(tmpDir, backupFolder, "database.sql");
  const s2 = fe();
  s2.start("Restoring database");
  try {
    dockerExecFromFile(
      dbContainer,
      "psql -U launch-lms -d launch-lms",
      dumpPath
    );
    s2.stop("Database restored");
  } catch {
    s2.stop("Database restore failed");
    fs3.rmSync(tmpDir, { recursive: true, force: true });
    O2.error("Failed to restore database. The backup file may be corrupted.");
    process.exit(1);
  }
  const envBackup = path3.join(tmpDir, backupFolder, ".env");
  if (fs3.existsSync(envBackup)) {
    const restoreEnv = await ot2({
      message: "Backup contains a .env file. Restore it? (overwrites current .env)",
      initialValue: false
    });
    if (!q(restoreEnv) && restoreEnv) {
      fs3.copyFileSync(envBackup, path3.join(installDir, ".env"));
      O2.info(".env file restored");
    }
  }
  fs3.rmSync(tmpDir, { recursive: true, force: true });
  O2.success(import_picocolors10.default.green(import_picocolors10.default.bold("Restore complete!")));
  O2.info(`You may want to restart services: ${LOCAL_CLI_COMMAND} stop && ${LOCAL_CLI_COMMAND} start`);
}
async function backupCommand(archivePath, options) {
  if (options?.restore && archivePath) {
    mt(import_picocolors10.default.cyan("Launch LMS Restore"));
    await restoreBackup(archivePath);
    return;
  }
  mt(import_picocolors10.default.cyan("Launch LMS Backup"));
  const action = await _t({
    message: "What would you like to do?",
    options: [
      { value: "create", label: "Create a backup" },
      { value: "restore", label: "Restore from a backup" }
    ]
  });
  if (q(action)) {
    pt();
    process.exit(0);
  }
  if (action === "create") {
    await createBackup();
  } else {
    const filePath = await text({
      message: "Path to backup archive (.tar.gz)",
      placeholder: "./backups/launch-lms-backup-*.tar.gz"
    });
    if (q(filePath)) {
      pt();
      process.exit(0);
    }
    await restoreBackup(filePath);
  }
}

// src/commands/deployments.ts
import fs4 from "fs";
import path4 from "path";
import { execSync as execSync3 } from "child_process";
var import_picocolors11 = __toESM(require_picocolors(), 1);
var SERVICES = ["launch-lms-app", "db", "redis"];
function showDeployments() {
  let psOutput;
  try {
    psOutput = execSync3(
      'docker ps -a --filter "name=launch-lms-app-" --format "{{.Names}}\\t{{.Status}}\\t{{.Image}}"',
      { stdio: "pipe" }
    ).toString().trim();
  } catch {
    O2.error("Failed to query Docker. Is Docker running?");
    process.exit(1);
  }
  if (!psOutput) {
    O2.info("No Launch LMS deployments found.");
    O2.message(import_picocolors11.default.dim(`  Run ${LOCAL_CLI_COMMAND} setup to create one.`));
    return;
  }
  const deployments = /* @__PURE__ */ new Map();
  let allOutput;
  try {
    allOutput = execSync3(
      'docker ps -a --filter "name=launch-lms-" --format "{{.Names}}\\t{{.Status}}\\t{{.Image}}"',
      { stdio: "pipe" }
    ).toString().trim();
  } catch {
    allOutput = psOutput;
  }
  for (const line of allOutput.split("\n")) {
    if (!line.trim()) continue;
    const [name, status, image] = line.split("	");
    const match = name.match(/launch-lms-\w+-([a-f0-9]+)$/);
    if (!match) continue;
    const id = match[1];
    if (!deployments.has(id)) {
      deployments.set(id, { id, containers: [] });
    }
    deployments.get(id).containers.push({ name, status, image });
  }
  O2.info(`Found ${import_picocolors11.default.bold(String(deployments.size))} deployment${deployments.size === 1 ? "" : "s"}`);
  console.log();
  for (const [id, dep] of deployments) {
    const running = dep.containers.filter((c2) => c2.status.toLowerCase().startsWith("up")).length;
    const total = dep.containers.length;
    const statusColor = running === total ? import_picocolors11.default.green : running > 0 ? import_picocolors11.default.yellow : import_picocolors11.default.red;
    const statusText = statusColor(`${running}/${total} running`);
    console.log(`  ${import_picocolors11.default.bold(import_picocolors11.default.white(`Deployment ${id}`))}  ${statusText}`);
    console.log();
    for (const c2 of dep.containers) {
      const isUp = c2.status.toLowerCase().startsWith("up");
      const icon = isUp ? import_picocolors11.default.green("\u25CF") : import_picocolors11.default.red("\u25CF");
      const svcName = c2.name.replace(`-${id}`, "");
      console.log(`    ${icon}  ${import_picocolors11.default.white(svcName.padEnd(24))} ${import_picocolors11.default.dim(c2.status)}`);
    }
    console.log();
  }
}
function parseMemLimit(composePath) {
  const content = fs4.readFileSync(composePath, "utf-8");
  const limits = /* @__PURE__ */ new Map();
  let currentService = null;
  let inServices = false;
  for (const line of content.split("\n")) {
    if (line.match(/^services:\s*$/)) {
      inServices = true;
      continue;
    }
    if (inServices && line.match(/^  \w/) && line.includes(":")) {
      const match = line.match(/^\s{2}(\S+):/);
      currentService = match ? match[1] : null;
    }
    if (currentService && line.match(/^\s+mem_limit:/)) {
      const value = line.split(":")[1].trim();
      limits.set(currentService, value);
    }
  }
  return limits;
}
function setMemLimit(content, service, limit) {
  const lines = content.split("\n");
  const result = [];
  let currentService = null;
  let inServices = false;
  let serviceIndent = 0;
  let insertedForService = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^services:\s*$/)) {
      inServices = true;
      result.push(line);
      continue;
    }
    if (inServices && line.match(/^  \w/) && line.includes(":")) {
      const match = line.match(/^(\s{2})(\S+):/);
      if (match) {
        currentService = match[2];
        serviceIndent = match[1].length;
        insertedForService = false;
      }
    }
    if (currentService === service && line.match(/^\s+mem_limit:/)) {
      result.push(line.replace(/mem_limit:.*/, `mem_limit: ${limit}`));
      insertedForService = true;
      continue;
    }
    if (currentService === service && !insertedForService && line.match(/^\s+container_name:/)) {
      result.push(line);
      result.push(`${" ".repeat(serviceIndent + 2)}mem_limit: ${limit}`);
      insertedForService = true;
      continue;
    }
    result.push(line);
  }
  return result.join("\n");
}
async function scaleResources() {
  const dir = findInstallDir();
  const config = readConfig(dir);
  if (!config) {
    O2.error("No Launch LMS installation found. Run setup first.");
    process.exit(1);
  }
  O2.step("Current Resource Usage");
  try {
    const stats = dockerStats(config.installDir);
    O2.message(import_picocolors11.default.dim(stats.trim()));
  } catch {
    try {
      const id = config.deploymentId || autoDetectDeploymentId();
      const running = listDeploymentContainers(id || void 0).filter((c2) => c2.status.toLowerCase().startsWith("up")).map((c2) => c2.name);
      if (running.length > 0) {
        const stats = dockerStatsForContainers(running);
        O2.message(import_picocolors11.default.dim(stats.trim()));
      } else {
        O2.warn("No running containers found.");
      }
    } catch {
      O2.warn("Could not retrieve current stats. Services may not be running.");
    }
  }
  const composePath = path4.join(config.installDir || dir, "docker-compose.yml");
  if (!fs4.existsSync(composePath)) {
    O2.error("docker-compose.yml not found.");
    process.exit(1);
  }
  let composeContent = fs4.readFileSync(composePath, "utf-8");
  const currentLimits = parseMemLimit(composePath);
  O2.step("Set Memory Limits");
  O2.info(import_picocolors11.default.dim("Examples: 256m, 512m, 1g, 2g (leave empty to skip)"));
  let changed = false;
  for (const service of SERVICES) {
    const current = currentLimits.get(service);
    const label = current ? `Memory limit for ${import_picocolors11.default.bold(service)} (current: ${current})` : `Memory limit for ${import_picocolors11.default.bold(service)} (not set)`;
    const value = await text({
      message: label,
      placeholder: current ? void 0 : "e.g. 512m",
      defaultValue: current || ""
    });
    if (q(value)) {
      pt();
      process.exit(0);
    }
    const trimmed = value.trim();
    if (trimmed && trimmed.match(/^\d+[mgMG]$/)) {
      composeContent = setMemLimit(composeContent, service, trimmed);
      changed = true;
      O2.success(`${service}: ${trimmed}`);
    } else if (trimmed) {
      O2.warn(`Invalid format "${trimmed}" \u2014 skipping. Use format like 512m or 1g.`);
    }
  }
  if (!changed) {
    O2.info("No changes made.");
    return;
  }
  fs4.writeFileSync(composePath, composeContent);
  O2.success("docker-compose.yml updated");
  const restart = await ot2({
    message: "Restart services to apply limits?",
    initialValue: false
  });
  if (!q(restart) && restart) {
    const s = fe();
    s.start("Restarting services");
    try {
      dockerComposeDown(config.installDir);
      dockerComposeUp(config.installDir);
      s.stop("Services restarted");
    } catch {
      s.stop("Restart failed");
      O2.error("Failed to restart services. Check Docker output above.");
    }
  }
}
async function deploymentsCommand() {
  mt(import_picocolors11.default.cyan("Launch LMS Deployments"));
  const action = await _t({
    message: "What would you like to do?",
    options: [
      { value: "view", label: "View deployments" },
      { value: "scale", label: "Set resource limits" }
    ]
  });
  if (q(action)) {
    pt();
    process.exit(0);
  }
  if (action === "view") {
    showDeployments();
  } else {
    await scaleResources();
  }
  gt(import_picocolors11.default.dim("Done"));
}

// src/commands/doctor.ts
import fs5 from "fs";
import path5 from "path";
import { execSync as execSync4 } from "child_process";
var import_picocolors12 = __toESM(require_picocolors(), 1);
function pass(msg) {
  console.log(`  ${import_picocolors12.default.green("\u2713")} ${msg}`);
}
function warn(msg, fix) {
  console.log(`  ${import_picocolors12.default.yellow("!")} ${msg}`);
  if (fix) console.log(`    ${import_picocolors12.default.dim(`Fix: ${fix}`)}`);
}
function fail(msg, fix) {
  console.log(`  ${import_picocolors12.default.red("\u2717")} ${msg}`);
  if (fix) console.log(`    ${import_picocolors12.default.dim(`Fix: ${fix}`)}`);
}
var REQUIRED_ENV_VARS = [
  "LAUNCHLMS_DOMAIN",
  "LAUNCHLMS_SQL_CONNECTION_STRING",
  "LAUNCHLMS_REDIS_CONNECTION_STRING",
  "LAUNCHLMS_AUTH_JWT_SECRET_KEY",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL"
];
var SECRET_ENV_VARS = [
  "LAUNCHLMS_AUTH_JWT_SECRET_KEY",
  "NEXTAUTH_SECRET",
  "POSTGRES_PASSWORD"
];
async function doctorCommand() {
  const dir = findInstallDir();
  const config = readConfig(dir);
  mt(import_picocolors12.default.cyan("Launch LMS Doctor"));
  O2.step("Docker Environment");
  if (!isDockerInstalled()) {
    fail("Docker not installed", "Install Docker: https://docs.docker.com/get-docker/");
    gt(import_picocolors12.default.red("Cannot continue without Docker"));
    process.exit(1);
  }
  pass("Docker installed");
  if (!isDockerRunning()) {
    fail("Docker daemon not running", "Start Docker Desktop or run: sudo systemctl start docker");
    gt(import_picocolors12.default.red("Cannot continue without Docker running"));
    process.exit(1);
  }
  pass("Docker daemon running");
  if (isDockerComposeV2()) {
    pass("Docker Compose v2 available");
  } else {
    fail("Docker Compose v2 not found", "Update Docker Desktop or install docker-compose-plugin");
  }
  if (!config) {
    O2.warn("No Launch LMS installation found. Skipping deployment checks.");
    gt(import_picocolors12.default.dim("Done"));
    return;
  }
  const id = config.deploymentId || autoDetectDeploymentId();
  const installDir = dir;
  if (!id) {
    O2.warn("No deployment ID found. Skipping container checks.");
    gt(import_picocolors12.default.dim("Done"));
    return;
  }
  O2.step("Containers");
  const containers = listDeploymentContainers(id);
  if (containers.length === 0) {
    warn("No containers found", `Run: ${LOCAL_CLI_COMMAND} start`);
  } else {
    for (const c2 of containers) {
      const isUp = c2.status.toLowerCase().startsWith("up");
      const svcName = c2.name.replace(`-${id}`, "");
      if (isUp) {
        pass(`${svcName} running`);
      } else if (c2.status.toLowerCase().includes("restarting")) {
        fail(`${svcName} is restarting`, `Check logs: ${LOCAL_CLI_COMMAND} logs`);
      } else {
        fail(`${svcName} \u2014 ${c2.status}`, `Run: ${LOCAL_CLI_COMMAND} start`);
      }
    }
  }
  O2.step("Restart Counts");
  for (const c2 of containers) {
    const count = getContainerRestartCount(c2.name);
    const svcName = c2.name.replace(`-${id}`, "");
    if (count > 3) {
      warn(`${svcName} has restarted ${count} times`, "Check container logs for crash reasons");
    } else {
      pass(`${svcName} \u2014 ${count} restarts`);
    }
  }
  O2.step("Network");
  const portFree = await checkPort(config.httpPort);
  if (portFree) {
    pass(`Port ${config.httpPort} is available`);
  } else {
    const hasRunning = containers.some((c2) => c2.status.toLowerCase().startsWith("up"));
    if (hasRunning) {
      pass(`Port ${config.httpPort} in use (by Launch LMS services)`);
    } else {
      warn(`Port ${config.httpPort} is in use by another process`, `Free the port or change HTTP_PORT in .env`);
    }
  }
  if (config.domain !== "localhost" && !config.domain.startsWith("127.")) {
    try {
      const { promises: dns } = await import("dns");
      await dns.resolve(config.domain);
      pass(`DNS resolves for ${config.domain}`);
    } catch {
      warn(`DNS resolution failed for ${config.domain}`, "Check your DNS settings or /etc/hosts");
    }
  }
  O2.step("Disk");
  try {
    const dfOutput = execSync4("df -h . | tail -1 | awk '{print $4}'", {
      stdio: "pipe",
      cwd: installDir
    }).toString().trim();
    const sizeStr = dfOutput.toLowerCase();
    const numericVal = parseFloat(sizeStr);
    if (sizeStr.includes("g") && numericVal < 1) {
      warn(`Low disk space: ${dfOutput} available`, "Free up disk space or docker system prune");
    } else if (sizeStr.includes("m")) {
      warn(`Low disk space: ${dfOutput} available`, "Free up disk space or docker system prune");
    } else {
      pass(`Disk space available: ${dfOutput}`);
    }
  } catch {
    warn("Could not check disk space");
  }
  try {
    const diskUsage = getDockerDiskUsage();
    O2.message(import_picocolors12.default.dim(diskUsage.trim()));
  } catch {
  }
  O2.step("Log Analysis");
  const errorPatterns = /ERROR|FATAL|Traceback/i;
  for (const c2 of containers) {
    if (!isContainerRunning(c2.name)) continue;
    try {
      const logs = getContainerLogs(c2.name, 50);
      const errorLines = logs.split("\n").filter((l) => errorPatterns.test(l));
      const svcName = c2.name.replace(`-${id}`, "");
      if (errorLines.length > 0) {
        warn(`${svcName} \u2014 ${errorLines.length} error(s) in last 50 log lines`);
        for (const line of errorLines.slice(0, 3)) {
          console.log(`    ${import_picocolors12.default.dim(line.trim().slice(0, 120))}`);
        }
      } else {
        pass(`${svcName} \u2014 no errors in recent logs`);
      }
    } catch {
      warn(`Could not read logs for ${c2.name}`);
    }
  }
  O2.step("Environment File");
  const envPath = path5.join(installDir, ".env");
  if (!fs5.existsSync(envPath)) {
    fail(".env file missing", `Run setup again: ${LOCAL_CLI_COMMAND} setup`);
  } else {
    const envContent = fs5.readFileSync(envPath, "utf-8");
    const envMap = /* @__PURE__ */ new Map();
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      envMap.set(trimmed.slice(0, eqIdx), trimmed.slice(eqIdx + 1));
    }
    let envOk = true;
    for (const key of REQUIRED_ENV_VARS) {
      if (!envMap.has(key) || !envMap.get(key)) {
        fail(`Missing or empty: ${key}`);
        envOk = false;
      }
    }
    for (const key of SECRET_ENV_VARS) {
      const val = envMap.get(key) || "";
      if (val && val.length < 8) {
        warn(`${key} seems too short (${val.length} chars)`, "Use a stronger secret");
        envOk = false;
      }
    }
    if (envOk) {
      pass("All required environment variables present");
    }
  }
  O2.step("Image Freshness");
  for (const c2 of containers) {
    try {
      const localDigest = execSync4(
        `docker inspect --format '{{.Image}}' ${c2.name}`,
        { stdio: "pipe" }
      ).toString().trim();
      const svcName = c2.name.replace(`-${id}`, "");
      pass(`${svcName} \u2014 image: ${localDigest.slice(7, 19)}`);
    } catch {
    }
  }
  console.log();
  gt(import_picocolors12.default.dim("Diagnosis complete"));
}

// src/commands/shell.ts
var import_picocolors13 = __toESM(require_picocolors(), 1);
async function shellCommand() {
  const dir = findInstallDir();
  const config = readConfig(dir);
  if (!config) {
    O2.error("No Launch LMS installation found. Run setup first.");
    process.exit(1);
  }
  const id = config.deploymentId || autoDetectDeploymentId();
  if (!id) {
    O2.error("No deployment found. Start services first.");
    process.exit(1);
  }
  const containers = listDeploymentContainers(id).filter((c2) => c2.status.toLowerCase().startsWith("up"));
  if (containers.length === 0) {
    O2.error("No running containers found. Start services first.");
    process.exit(1);
  }
  const selected = await _t({
    message: "Select a container",
    options: containers.map((c2) => ({
      value: c2.name,
      label: `${c2.name.replace(`-${id}`, "")} ${import_picocolors13.default.dim(`(${c2.name})`)}`
    }))
  });
  if (q(selected)) {
    pt();
    process.exit(0);
  }
  O2.info(`Connecting to ${selected}... (type "exit" to leave)`);
  dockerExecInteractive(selected, "/bin/sh");
}

// src/commands/dev.ts
import { spawn as spawn2, spawnSync as spawnSync2, execSync as execSync5 } from "child_process";
var import_picocolors15 = __toESM(require_picocolors(), 1);
import * as path7 from "path";
import * as fs7 from "fs";

// src/services/env-check.ts
import * as fs6 from "fs";
import * as path6 from "path";
import * as crypto4 from "crypto";
var import_picocolors14 = __toESM(require_picocolors(), 1);
function generateJwtSecret() {
  return crypto4.randomBytes(32).toString("base64url");
}
var API_ENV = {
  label: "API",
  envFile: "apps/api/.env",
  vars: [
    {
      name: "LAUNCHLMS_AUTH_JWT_SECRET_KEY",
      aliases: ["LAUNCHLMS_AUTH_JWT_SECRET_KEY"],
      required: true,
      description: "JWT signing secret (min 32 chars)",
      defaultValue: generateJwtSecret
    },
    {
      name: "COLLAB_INTERNAL_KEY",
      required: true,
      description: "Shared key for collab \u2194 API auth",
      defaultValue: "dev-collab-internal-key-change-in-prod"
    }
  ]
};
var WEB_ENV = {
  label: "Web",
  envFile: "apps/web/.env.local",
  vars: [
    {
      name: "NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL",
      required: true,
      description: "Backend API URL",
      defaultValue: "http://localhost:1338/"
    }
  ]
};
var COLLAB_ENV = {
  label: "Collab",
  envFile: "apps/collab/.env",
  vars: [
    {
      name: "COLLAB_PORT",
      required: true,
      description: "WebSocket server port",
      defaultValue: "4000"
    },
    {
      name: "LAUNCHLMS_API_URL",
      required: true,
      description: "Launch LMS API base URL",
      defaultValue: "http://localhost:1338"
    },
    {
      name: "LAUNCHLMS_AUTH_JWT_SECRET_KEY",
      aliases: ["LAUNCHLMS_AUTH_JWT_SECRET_KEY"],
      required: true,
      description: "JWT secret (must match API)",
      defaultValue: ""
      // filled from API value at write-time
    },
    {
      name: "COLLAB_INTERNAL_KEY",
      required: true,
      description: "Internal key (must match API)",
      defaultValue: ""
      // filled from API value at write-time
    }
  ]
};
var ALL_APPS = [API_ENV, WEB_ENV, COLLAB_ENV];
function parseEnvFile(filePath) {
  const vars = /* @__PURE__ */ new Map();
  if (!fs6.existsSync(filePath)) return vars;
  for (const line of fs6.readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    const cIdx = value.indexOf(" #");
    if (cIdx !== -1) value = value.slice(0, cIdx).trim();
    vars.set(key, value);
  }
  return vars;
}
function appendToEnvFile(filePath, newVars) {
  let content = "";
  if (fs6.existsSync(filePath)) {
    content = fs6.readFileSync(filePath, "utf-8");
    if (content.length > 0 && !content.endsWith("\n")) content += "\n";
  }
  for (const [key, value] of newVars) {
    content += `${key}=${value}
`;
  }
  const dir = path6.dirname(filePath);
  if (!fs6.existsSync(dir)) fs6.mkdirSync(dir, { recursive: true });
  fs6.writeFileSync(filePath, content);
}
function resolveDefault(v) {
  return typeof v.defaultValue === "function" ? v.defaultValue() : v.defaultValue;
}
function getExistingValue(existing, envVar) {
  const keys = [envVar.name, ...envVar.aliases || []];
  for (const key of keys) {
    const value = existing.get(key);
    if (value && value.length > 0) return value;
  }
  return void 0;
}
async function checkDevEnv(root) {
  const missing = [];
  for (const app of ALL_APPS) {
    const existing = parseEnvFile(path6.join(root, app.envFile));
    for (const v of app.vars) {
      const val = getExistingValue(existing, v);
      if (v.required && (!val || val.length === 0)) {
        missing.push({ app, envVar: v });
      }
    }
  }
  if (missing.length === 0) {
    O2.success("Environment files look good");
    return true;
  }
  O2.warning(`Found ${missing.length} missing env variable${missing.length > 1 ? "s" : ""}:`);
  console.log();
  const byApp = /* @__PURE__ */ new Map();
  for (const m of missing) {
    const list = byApp.get(m.app.label) ?? [];
    list.push(m);
    byApp.set(m.app.label, list);
  }
  for (const [label, vars] of byApp) {
    console.log(`  ${import_picocolors14.default.bold(label)} ${import_picocolors14.default.dim(`(${vars[0].app.envFile})`)}`);
    for (const m of vars) {
      console.log(`    ${import_picocolors14.default.red("\u2717")} ${import_picocolors14.default.cyan(m.envVar.name)} \u2014 ${import_picocolors14.default.dim(m.envVar.description)}`);
    }
    console.log();
  }
  const action = await _t({
    message: "How would you like to proceed?",
    options: [
      { value: "defaults", label: "Apply dev defaults and continue", hint: "writes only the missing vars" },
      { value: "abort", label: "Abort \u2014 I'll set them up manually" }
    ]
  });
  if (q(action) || action === "abort") {
    O2.info("Set the missing variables and run the command again.");
    return false;
  }
  const apiFile = path6.join(root, API_ENV.envFile);
  const apiExisting = parseEnvFile(apiFile);
  const jwtSecret = apiExisting.get("LAUNCHLMS_AUTH_JWT_SECRET_KEY") || apiExisting.get("LAUNCHLMS_AUTH_JWT_SECRET_KEY") || generateJwtSecret();
  const collabKey = apiExisting.get("COLLAB_INTERNAL_KEY") || "dev-collab-internal-key-change-in-prod";
  for (const app of ALL_APPS) {
    const filePath = path6.join(root, app.envFile);
    const existing = parseEnvFile(filePath);
    const toWrite = /* @__PURE__ */ new Map();
    for (const v of app.vars) {
      const val = getExistingValue(existing, v);
      if (!v.required || val && val.length > 0) continue;
      if (v.name === "LAUNCHLMS_AUTH_JWT_SECRET_KEY") {
        toWrite.set("LAUNCHLMS_AUTH_JWT_SECRET_KEY", jwtSecret);
      } else if (v.name === "COLLAB_INTERNAL_KEY") {
        toWrite.set(v.name, collabKey);
      } else {
        toWrite.set(v.name, resolveDefault(v));
      }
    }
    if (toWrite.size > 0) {
      appendToEnvFile(filePath, toWrite);
      const names = [...toWrite.keys()].map((k) => import_picocolors14.default.cyan(k)).join(", ");
      O2.success(`${import_picocolors14.default.bold(app.label)}: wrote ${names} \u2192 ${import_picocolors14.default.dim(app.envFile)}`);
    }
  }
  console.log();
  return true;
}

// src/commands/dev.ts
var PROJECT_NAME = "launch-lms-dev";
var DEV_COMPOSE = `name: launch-lms-dev

services:
  db:
    image: pgvector/pgvector:pg16
    container_name: launch-lms-db-dev
    restart: unless-stopped
    environment:
      - POSTGRES_USER=launchlms
      - POSTGRES_PASSWORD=launchlms
      - POSTGRES_DB=launchlms
    ports:
      - "5432:5432"
    volumes:
      - launch_lms_db_dev_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U launchlms"]
      interval: 5s
      timeout: 4s
      retries: 5

  redis:
    image: redis:8.6.1-alpine
    container_name: launch-lms-redis-dev
    restart: unless-stopped
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - launch_lms_redis_dev_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 4s
      retries: 5

volumes:
  launch_lms_db_dev_data:
  launch_lms_redis_dev_data:
`;
function findProjectRoot() {
  let dir = process.cwd();
  while (true) {
    if (fs7.existsSync(path7.join(dir, "apps", "api")) && fs7.existsSync(path7.join(dir, "apps", "web"))) {
      return dir;
    }
    const parent = path7.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function getDevComposePath(root) {
  const dotDir = path7.join(root, ".launch-lms");
  if (!fs7.existsSync(dotDir)) fs7.mkdirSync(dotDir, { recursive: true });
  const composePath = path7.join(dotDir, "docker-compose.dev.yml");
  fs7.writeFileSync(composePath, DEV_COMPOSE);
  return composePath;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function getDevDatabaseUrl() {
  return "postgresql://launchlms:launchlms@localhost:5432/launchlms";
}
function runDevMigrations(root, apiDir) {
  const migrationsScript = path7.join(apiDir, "scripts", "run_alembic_migrations.sh");
  const uvCacheDir = path7.join(root, ".launch-lms", "uv-cache");
  if (!fs7.existsSync(uvCacheDir)) {
    fs7.mkdirSync(uvCacheDir, { recursive: true });
  }
  const env = {
    ...process.env,
    ...serviceEnv,
    UV_CACHE_DIR: process.env.UV_CACHE_DIR || uvCacheDir,
    LAUNCHLMS_SQL_CONNECTION_STRING: process.env.LAUNCHLMS_SQL_CONNECTION_STRING || process.env.DATABASE_URL || getDevDatabaseUrl()
  };
  const migrationSpinner = fe();
  migrationSpinner.start("Running database migrations...");
  try {
    execSync5(`bash ${migrationsScript}`, {
      cwd: apiDir,
      stdio: "pipe",
      env
    });
    migrationSpinner.stop("Database migrations are up to date");
  } catch (e) {
    migrationSpinner.stop("Database migrations failed");
    const stderr = e?.stderr?.toString()?.trim();
    const stdout = e?.stdout?.toString()?.trim();
    O2.error(stderr || stdout || "Failed to run Alembic migrations");
    process.exit(1);
  }
}
async function waitForHealth2(label, command, args, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      execSync5([command, ...args].join(" "), { stdio: "pipe", timeout: 5e3 });
      return true;
    } catch {
      await sleep(1e3);
    }
  }
  return false;
}
var CONTROLS_BAR = import_picocolors15.default.dim("\u2500".repeat(60)) + "\n" + import_picocolors15.default.dim("  ") + import_picocolors15.default.bold("ra") + import_picocolors15.default.dim(" restart api  ") + import_picocolors15.default.bold("rw") + import_picocolors15.default.dim(" restart web  ") + import_picocolors15.default.bold("rc") + import_picocolors15.default.dim(" restart collab  ") + import_picocolors15.default.bold("rb") + import_picocolors15.default.dim(" restart all  ") + import_picocolors15.default.bold("q") + import_picocolors15.default.dim(" quit") + "\n" + import_picocolors15.default.dim("\u2500".repeat(60));
var lineCount = 0;
var CONTROLS_INTERVAL = 50;
function printControls() {
  process.stdout.write("\n" + CONTROLS_BAR + "\n\n");
  lineCount = 0;
}
function prefixStream(proc, label, color) {
  const prefix = color(`[${label}]`);
  const handleData = (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (line.length > 0) {
        process.stdout.write(`${prefix} ${line}
`);
        lineCount++;
        if (lineCount >= CONTROLS_INTERVAL) {
          printControls();
        }
      }
    }
  };
  proc.stdout?.on("data", handleData);
  proc.stderr?.on("data", handleData);
}
function isContainerRunning2(name) {
  try {
    const state = execSync5(
      `docker inspect --format '{{.State.Running}}' ${name}`,
      { stdio: "pipe" }
    ).toString().trim();
    return state === "true";
  } catch {
    return false;
  }
}
function isInfraRunning() {
  return isContainerRunning2("launch-lms-db-dev") && isContainerRunning2("launch-lms-redis-dev");
}
var serviceEnv = {};
function spawnService(command, args, cwd, label, color) {
  const localBin = path7.join(cwd, "node_modules", ".bin");
  const child = spawn2(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...serviceEnv,
      PATH: `${localBin}:${process.env.PATH ?? ""}`
    }
  });
  prefixStream(child, label, color);
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.log(color(`[${label}]`) + ` exited with code ${code}`);
    }
  });
  return child;
}
function killProcess(child) {
  return new Promise((resolve) => {
    if (!child || child.killed || child.exitCode !== null) {
      resolve();
      return;
    }
    child.on("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed && child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }, 5e3);
  });
}
async function devCommand(opts) {
  const root = findProjectRoot();
  if (!root) {
    O2.error("Not inside a Launch LMS project.");
    O2.info("Run this command from within the launch-lms monorepo (must contain dev/docker-compose.yml, apps/api/, and apps/web/).");
    process.exit(1);
  }
  mt(import_picocolors15.default.cyan("Launch LMS Dev Mode"));
  const envOk = await checkDevEnv(root);
  if (!envOk) process.exit(1);
  const eePath = path7.join(root, "apps", "api", "ee");
  if (fs7.existsSync(eePath)) {
    O2.info(`EE source detected at ${import_picocolors15.default.bold("apps/api/ee")} \u2014 leaving it untouched for local dev`);
  } else if (opts.ee) {
    O2.warning("--ee was passed but no ee/ folder found");
  }
  if (!isDockerInstalled()) {
    O2.error("Docker is not installed. Please install Docker and try again.");
    process.exit(1);
  }
  if (!isDockerRunning()) {
    O2.error("Docker is not running. Please start Docker and try again.");
    process.exit(1);
  }
  console.log();
  const composePath = getDevComposePath(root);
  const alreadyRunning = isInfraRunning();
  if (alreadyRunning) {
    O2.success("Existing DB and Redis containers detected \u2014 reusing them");
  }
  if (!alreadyRunning) {
    const email = await text({
      message: "Admin email",
      placeholder: "admin@school.dev",
      defaultValue: "admin@school.dev"
    });
    if (q(email)) process.exit(0);
    const password = await bt({
      message: "Admin password"
    });
    if (q(password)) process.exit(0);
    if (!password) {
      O2.error("Password is required.");
      process.exit(1);
    }
    serviceEnv = {
      FORCE_COLOR: "1",
      LAUNCHLMS_INITIAL_ADMIN_EMAIL: email,
      LAUNCHLMS_INITIAL_ADMIN_PASSWORD: password
    };
    const infraSpinner = fe();
    infraSpinner.start("Starting DB and Redis containers...");
    try {
      execSync5(`docker compose -f ${composePath} -p ${PROJECT_NAME} up -d`, {
        cwd: root,
        stdio: "pipe"
      });
      infraSpinner.stop("Containers started");
    } catch (e) {
      infraSpinner.stop("Failed to start containers");
      O2.error(e.stderr?.toString() || "docker compose up failed");
      process.exit(1);
    }
  } else {
    serviceEnv = {
      FORCE_COLOR: "1"
    };
  }
  const healthSpinner = fe();
  healthSpinner.start("Waiting for DB and Redis to be healthy...");
  const [dbReady, redisReady] = await Promise.all([
    waitForHealth2("DB", "docker", ["exec", "launch-lms-db-dev", "pg_isready", "-U", "launchlms"]),
    waitForHealth2("Redis", "docker", ["exec", "launch-lms-redis-dev", "redis-cli", "ping"])
  ]);
  if (!dbReady || !redisReady) {
    healthSpinner.stop("Health checks failed");
    if (!dbReady) O2.error("Database did not become ready in time.");
    if (!redisReady) O2.error("Redis did not become ready in time.");
    process.exit(1);
  }
  healthSpinner.stop("DB and Redis are healthy");
  const webDir = path7.join(root, "apps", "web");
  const collabDir = path7.join(root, "apps", "collab");
  const apiDir = path7.join(root, "apps", "api");
  const bunProjects = [
    { label: "web", dir: webDir },
    { label: "collab", dir: collabDir }
  ];
  for (const { label, dir } of bunProjects) {
    if (!fs7.existsSync(path7.join(dir, "node_modules"))) {
      O2.info(`Installing ${label} dependencies...`);
      const result = spawnSync2("bun", ["install"], { cwd: dir, stdio: "inherit", shell: true });
      if (result.status !== 0) {
        O2.error(`Failed to install ${label} dependencies`);
        process.exit(1);
      }
    }
  }
  if (!fs7.existsSync(path7.join(apiDir, ".venv"))) {
    O2.info("Installing API dependencies...");
    const result = spawnSync2("uv", ["sync"], { cwd: apiDir, stdio: "inherit", shell: true });
    if (result.status !== 0) {
      O2.error("Failed to install API dependencies");
      process.exit(1);
    }
  }
  runDevMigrations(root, apiDir);
  const certFile = path7.join(root, "certs", "local.pem");
  const keyFile = path7.join(root, "certs", "local-key.pem");
  let hasCerts = fs7.existsSync(certFile) && fs7.existsSync(keyFile);
  if (!hasCerts) {
    O2.info("No TLS certs found \u2014 running cert setup...");
    const setupScript = path7.join(root, "scripts", "setup-dev-certs.sh");
    const result = spawnSync2("bash", [setupScript], { stdio: "inherit", cwd: root });
    if (result.status === 0) {
      hasCerts = fs7.existsSync(certFile) && fs7.existsSync(keyFile);
      if (hasCerts) {
        O2.success("TLS certs generated \u2014 starting with HTTPS");
      } else {
        O2.warning("Cert script ran but certs not found \u2014 starting with HTTP");
      }
    } else {
      O2.warning("Cert setup failed \u2014 starting with HTTP");
    }
  } else {
    O2.success("TLS certs found \u2014 starting with HTTPS");
  }
  if (hasCerts) {
    try {
      const caRoot = execSync5("mkcert -CAROOT", { encoding: "utf8" }).trim();
      const caPath = path7.join(caRoot, "rootCA.pem");
      if (fs7.existsSync(caPath)) {
        serviceEnv.NODE_EXTRA_CA_CERTS = caPath;
      }
    } catch {
    }
  }
  let apiProc = null;
  let webProc = null;
  let collabProc = null;
  const startApi = () => {
    const args = ["run", "uvicorn", "app:app", "--reload", "--port", "1338"];
    return spawnService("uv", args, path7.join(root, "apps", "api"), "api", import_picocolors15.default.magenta);
  };
  const startWeb = () => {
    const args = ["dev"];
    if (hasCerts) args.push("--experimental-https", "--experimental-https-cert", certFile, "--experimental-https-key", keyFile);
    return spawnService("next", args, path7.join(root, "apps", "web"), "web", import_picocolors15.default.cyan);
  };
  const startCollab = () => {
    return spawnService("tsx", ["watch", "src/index.ts"], path7.join(root, "apps", "collab"), "collab", import_picocolors15.default.yellow);
  };
  apiProc = startApi();
  webProc = startWeb();
  collabProc = startCollab();
  O2.success("API, Web, and Collab servers started");
  console.log();
  console.log(import_picocolors15.default.dim("  Thank you for contributing to Launch LMS!"));
  console.log();
  printControls();
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n" + import_picocolors15.default.dim("Shutting down dev servers..."));
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
    await Promise.all([killProcess(apiProc), killProcess(webProc), killProcess(collabProc)]);
    console.log(import_picocolors15.default.dim("DB and Redis containers are still running for next session."));
    console.log(import_picocolors15.default.dim("To stop them: docker compose -f .launch-lms/docker-compose.dev.yml -p launch-lms-dev down"));
    console.log(import_picocolors15.default.dim("Thanks for building with Launch LMS!"));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let pendingR = false;
    process.stdin.on("data", async (key) => {
      if (key === "") {
        await shutdown();
        return;
      }
      if (key === "q") {
        await shutdown();
        return;
      }
      if (key === "r") {
        pendingR = true;
        setTimeout(() => {
          pendingR = false;
        }, 1e3);
        return;
      }
      if (pendingR) {
        pendingR = false;
        if (key === "a") {
          console.log(import_picocolors15.default.magenta("\n  Restarting API...\n"));
          await killProcess(apiProc);
          apiProc = startApi();
          printControls();
        } else if (key === "w") {
          console.log(import_picocolors15.default.cyan("\n  Restarting Web...\n"));
          await killProcess(webProc);
          webProc = startWeb();
          printControls();
        } else if (key === "c") {
          console.log(import_picocolors15.default.yellow("\n  Restarting Collab...\n"));
          await killProcess(collabProc);
          collabProc = startCollab();
          printControls();
        } else if (key === "b") {
          console.log(import_picocolors15.default.yellow("\n  Restarting all...\n"));
          await Promise.all([killProcess(apiProc), killProcess(webProc), killProcess(collabProc)]);
          apiProc = startApi();
          webProc = startWeb();
          collabProc = startCollab();
          printControls();
        }
      }
    });
  }
  await new Promise(() => {
  });
}

// src/commands/domain.ts
import fs8 from "fs";
import path8 from "path";
import { execSync as execSync6 } from "child_process";
var import_picocolors16 = __toESM(require_picocolors(), 1);
function parseEnv(content) {
  const map = /* @__PURE__ */ new Map();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    map.set(trimmed.slice(0, eqIdx), trimmed.slice(eqIdx + 1));
  }
  return map;
}
function serializeEnv(original, updated) {
  const lines = original.split("\n");
  const result = [];
  const written = /* @__PURE__ */ new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      result.push(line);
      continue;
    }
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) {
      result.push(line);
      continue;
    }
    const key = trimmed.slice(0, eqIdx);
    if (updated.has(key)) {
      result.push(`${key}=${updated.get(key)}`);
      written.add(key);
    } else {
      result.push(line);
    }
  }
  for (const [key, value] of updated) {
    if (!written.has(key)) result.push(`${key}=${value}`);
  }
  return result.join("\n");
}
function deriveTopDomain(domain) {
  return domain === "localhost" ? "localhost" : domain.split(".").slice(-2).join(".");
}
function deriveCookieDomain(domain) {
  return domain === "localhost" ? ".localhost" : `.${deriveTopDomain(domain)}`;
}
function replaceCaddySite(content, domain) {
  const lines = content.split("\n");
  let globalBlockDepth = 0;
  let inGlobalOptions = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!inGlobalOptions && trimmed === "{") {
      inGlobalOptions = true;
      globalBlockDepth = 1;
      continue;
    }
    if (inGlobalOptions) {
      globalBlockDepth += (trimmed.match(/{/g) || []).length;
      globalBlockDepth -= (trimmed.match(/}/g) || []).length;
      if (globalBlockDepth <= 0) {
        inGlobalOptions = false;
      }
      continue;
    }
    if (trimmed.endsWith("{")) {
      const indent = lines[i].match(/^\s*/)?.[0] ?? "";
      lines[i] = `${indent}${domain} {`;
      return lines.join("\n");
    }
  }
  throw new Error("Could not find a Caddy site block to update");
}
function collectCaddyCandidates(installDir, explicitPath) {
  const candidates = [
    explicitPath,
    path8.join(installDir, "extra", "Caddyfile"),
    path8.join(installDir, "Caddyfile"),
    "/etc/caddy/Caddyfile"
  ].filter((value) => Boolean(value));
  return [...new Set(candidates)].filter((filePath) => fs8.existsSync(filePath));
}
function updateCaddyFiles(domain, installDir, explicitPath) {
  const updated = [];
  for (const filePath of collectCaddyCandidates(installDir, explicitPath)) {
    const original = fs8.readFileSync(filePath, "utf-8");
    const next = replaceCaddySite(original, domain);
    if (next !== original) {
      fs8.writeFileSync(filePath, next);
      updated.push(filePath);
    }
  }
  return updated;
}
async function domainCommand(domain, options) {
  const installDir = findInstallDir();
  const config = readConfig(installDir);
  if (!config) {
    O2.error("No Launch LMS installation found in the current directory.");
    process.exit(1);
  }
  const envPath = path8.join(config.installDir, ".env");
  if (!fs8.existsSync(envPath)) {
    O2.error(`No .env file found at ${envPath}`);
    process.exit(1);
  }
  const protocol = config.useHttps ? "https" : "http";
  const portSuffix = config.useHttps && config.httpPort === 443 || !config.useHttps && config.httpPort === 80 ? "" : `:${config.httpPort}`;
  const baseUrl = `${protocol}://${domain}${portSuffix}`;
  const topDomain = deriveTopDomain(domain);
  const cookieDomain = deriveCookieDomain(domain);
  const collabProtocol = config.useHttps ? "wss" : "ws";
  mt(import_picocolors16.default.cyan("Launch LMS Domain Update"));
  const originalEnv = fs8.readFileSync(envPath, "utf-8");
  const envMap = parseEnv(originalEnv);
  const previousDomain = envMap.get("LAUNCHLMS_DOMAIN") || config.domain;
  envMap.set("LAUNCHLMS_DOMAIN", `${domain}${portSuffix}`);
  envMap.set("NEXT_PUBLIC_LAUNCHLMS_API_URL", `${baseUrl}/api/v1/`);
  envMap.set("NEXT_PUBLIC_LAUNCHLMS_BACKEND_URL", `${baseUrl}/`);
  envMap.set("NEXT_PUBLIC_LAUNCHLMS_DOMAIN", `${domain}${portSuffix}`);
  envMap.set("NEXT_PUBLIC_LAUNCHLMS_TOP_DOMAIN", topDomain);
  envMap.set("NEXTAUTH_URL", baseUrl);
  envMap.set("LAUNCHLMS_COOKIE_DOMAIN", cookieDomain);
  envMap.set("NEXT_PUBLIC_COLLAB_URL", `${collabProtocol}://${domain}${portSuffix}/collab`);
  const systemEmail = envMap.get("LAUNCHLMS_SYSTEM_EMAIL_ADDRESS");
  if (systemEmail === `noreply@${config.domain}` || systemEmail === `noreply@${previousDomain.replace(/:\d+$/, "")}`) {
    envMap.set("LAUNCHLMS_SYSTEM_EMAIL_ADDRESS", `noreply@${domain}`);
  }
  fs8.writeFileSync(envPath, serializeEnv(originalEnv, envMap));
  const nextConfig = { ...config, domain };
  fs8.writeFileSync(
    path8.join(config.installDir, "launch-lms.config.json"),
    JSON.stringify(nextConfig, null, 2) + "\n"
  );
  let updatedCaddyFiles = [];
  try {
    updatedCaddyFiles = updateCaddyFiles(domain, config.installDir, options.caddyPath);
  } catch (err) {
    O2.warn(`Caddy update skipped: ${err?.message ?? String(err)}`);
  }
  O2.success(`Updated domain references from ${import_picocolors16.default.dim(previousDomain)} to ${import_picocolors16.default.bold(domain)}`);
  O2.info(import_picocolors16.default.dim(`Environment: ${envPath}`));
  if (updatedCaddyFiles.length > 0) {
    for (const filePath of updatedCaddyFiles) {
      O2.info(import_picocolors16.default.dim(`Caddy config: ${filePath}`));
    }
  } else {
    O2.warn("No Caddyfile was updated automatically");
  }
  if (options.restart !== false) {
    const s = fe();
    s.start("Restarting Launch LMS services");
    try {
      dockerComposeDown(config.installDir);
      dockerComposeUp(config.installDir);
      s.stop("Launch LMS services restarted");
    } catch (err) {
      s.stop("Failed to restart Launch LMS services");
      O2.error(err?.message ?? String(err));
      process.exit(1);
    }
  }
  if (options.reloadCaddy !== false && updatedCaddyFiles.some((filePath) => filePath === "/etc/caddy/Caddyfile")) {
    try {
      execSync6("systemctl reload caddy", { stdio: "inherit" });
      O2.success("Reloaded system Caddy");
    } catch (err) {
      O2.warn(`Failed to reload system Caddy automatically: ${err?.message ?? String(err)}`);
    }
  }
  O2.message([
    `  ${import_picocolors16.default.dim("Next URL:")}      ${baseUrl}`,
    `  ${import_picocolors16.default.dim("Cookie domain:")} ${cookieDomain}`,
    `  ${import_picocolors16.default.dim("Top domain:")}    ${topDomain}`
  ].join("\n"));
  gt(import_picocolors16.default.dim("Done"));
}

// bin/launch-lms.ts
var COMMANDS = [
  { name: "setup", desc: "Interactive setup wizard" },
  { name: "start", desc: "Start services" },
  { name: "stop", desc: "Stop services" },
  { name: "logs", desc: "Stream logs" },
  { name: "config", desc: "Show configuration" },
  { name: "backup", desc: "Backup & restore database" },
  { name: "deployments", desc: "Manage deployments & resources" },
  { name: "doctor", desc: "Diagnose issues" },
  { name: "domain", desc: "Update domain, env, and Caddy config" },
  { name: "shell", desc: "Container shell access" },
  { name: "dev", desc: "Development mode" }
];
async function showWelcome() {
  await printBanner();
  console.log(import_picocolors17.default.bold(import_picocolors17.default.white("  Available commands:\n")));
  for (const cmd of COMMANDS) {
    console.log(`    ${import_picocolors17.default.cyan(cmd.name.padEnd(14))} ${import_picocolors17.default.dim(cmd.desc)}`);
  }
  console.log();
  console.log(import_picocolors17.default.dim("  Run a command with: launch-lms <command>"));
  console.log(import_picocolors17.default.dim("  Get started with:   launch-lms setup"));
  console.log();
}
var program2 = new Command();
program2.name("launch-lms").description("The Launch LMS CLI \u2014 deploy, manage, and operate your Launch LMS instance").version(VERSION).action(showWelcome);
program2.command("setup").description("Interactive setup wizard for Launch LMS").action(setupCommand);
program2.command("start").description("Start Launch LMS services").action(startCommand);
program2.command("stop").description("Stop Launch LMS services").action(stopCommand);
program2.command("logs").description("Stream logs from Launch LMS services").action(logsCommand);
program2.command("config").description("Show current Launch LMS configuration").action(configCommand);
program2.command("backup").description("Backup & restore Launch LMS database").argument("[archive]", "Path to backup archive for restore").option("--restore", "Restore from a backup archive").action(backupCommand);
program2.command("deployments").description("Manage deployments & resource limits").action(deploymentsCommand);
program2.command("doctor").description("Diagnose common issues with Launch LMS").action(doctorCommand);
program2.command("domain").description("Update the domain across env, config, and detected Caddyfiles").argument("<domain>", "New public domain, for example lms.example.com").option("--no-restart", "Update files only and skip Docker Compose restart").option("--no-reload-caddy", "Update files only and skip reloading system Caddy").option("--caddy-path <path>", "Explicit Caddyfile path to update").action(domainCommand);
program2.command("shell").description("Open a shell in a Launch LMS container").action(shellCommand);
program2.command("dev").description("Start development environment (DB + Redis in Docker, API + Web locally)").option("--ee", "Enable Enterprise Edition features (keeps ee/ folder)").action(devCommand);
var updateCheck = checkForUpdates();
program2.parseAsync().then(() => updateCheck.catch(() => {
}));
