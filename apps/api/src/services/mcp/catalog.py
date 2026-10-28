"""Tool catalog for the Launch LMS MCP server: every tool, its input schema, scope and handler."""

from __future__ import annotations

from src.services.goals import mcp_collections as goal_collections
from src.services.goals import mcp_library as goal_library
from src.services.goals import mcp_templates as goal_templates
from src.services.mcp import handlers
from src.services.mcp.coach_tools import COACH_TOOLS
from src.services.mcp.insights_tools import INSIGHTS_TOOLS
from src.services.mcp.media_tools import MEDIA_TOOLS
from src.services.mcp.tool import Handler, Tool  # noqa: F401  (re-exported)

_DOCUMENT = {"type": "object", "description": "An Activity Document (format 'launch-lms.activity', format_version 1). See get_activity_schema."}
_TEMPLATE_DOCUMENT = {"type": "object", "description": "A Goal Template Document (format 'launch-lms.goal-template', format_version 1): template details and stages of typed steps. See get_plan_template_schema."}
_FRAMEWORK_DOCUMENT = {"type": "object", "description": "A Requirement Framework Document (format 'launch-lms.requirement-framework', format_version 1). See get_requirement_framework_schema."}
_LIBRARY_KIND = {"type": "string", "enum": ["plan_template", "requirement_framework"]}
_LISTING_MODE = {"type": "string", "enum": ["locked", "open"], "description": "Plans only. locked: other organizations assign it as is (badge plans); open: they can copy and change it. Default open in publish_to_library, locked in set_plan_listing."}
_LISTING_ACCESS = {"type": "string", "enum": ["open", "request"], "description": "Plans only. open: any organization can add it; request: they ask and you approve. Default open in publish_to_library, request in set_plan_listing."}
_PERSONA = {
    "type": "object",
    "description": "Optional learner variables to preview with, e.g. {\"user.first_name\": \"Sam\", \"user.details.variables.grade\": \"9\"}.",
    "additionalProperties": True,
}


TOOLS = [
    Tool(
        "list_organizations",
        "List organizations",
        "List the organizations this admin can manage through the connector, and which one tools use by default. Pass another one's slug as `org` to any tool to act there.",
        {"properties": {}},
        handlers.list_organizations,
        org_scoped=False,
    ),
    Tool(
        "list_activities",
        "List activities",
        "List the interactive activities of a plan template: one per activity step, edited in place.",
        {"properties": {"template_uuid": {"type": "string"}}, "required": ["template_uuid"]},
        goal_templates.list_activities,
    ),
    Tool(
        "get_activity",
        "Get an activity",
        "Read one activity as an Activity Document, plus its etag (needed to save) and the template it belongs to.",
        {"properties": {"activity_uuid": {"type": "string"}}, "required": ["activity_uuid"]},
        handlers.get_activity,
    ),
    Tool(
        "get_activity_schema",
        "Activity format guide",
        "Get the authoring guide and JSON Schema for Activity Documents: blocks, questions, sequences and branches. Read it before writing or editing pages.",
        {"properties": {}},
        handlers.get_activity_schema,
    ),
    Tool(
        "list_variables",
        "List learner variables",
        "List the learner variables this organization defines, usable in branch rules, display bindings and preview personas.",
        {"properties": {}},
        handlers.list_variables,
    ),
    Tool(
        "validate_activity",
        "Validate an activity",
        "Check an Activity Document against every server rule without saving. Returns all errors and warnings with JSON paths. Pass activity_uuid when editing an existing activity.",
        {"properties": {"document": _DOCUMENT, "activity_uuid": {"type": "string"}}, "required": ["document"]},
        handlers.validate_activity,
    ),
    Tool(
        "preview_activity",
        "Preview an activity",
        "Show the admin an interactive preview of an activity exactly as learners will experience it (same player, grading and branching). Pass `document` to preview unsaved edits; omit it to preview what is saved. Nothing is written to learner records.",
        {
            "properties": {
                "activity_uuid": {"type": "string"},
                "template_uuid": {"type": "string", "description": "Use with `document` when previewing an activity that is not saved yet."},
                "document": _DOCUMENT,
                "persona": _PERSONA,
            },
        },
        handlers.preview_activity,
        ui=True,
    ),
    Tool(
        "save_activity",
        "Save an activity",
        "Save an Activity Document over the draft of a plan template's activity. Learners get it once the template is published (publish_plan_template); plans already issued keep the version they started with. Requires the etag from get_activity (or the last save). Fails with the current document if someone changed the activity since. Never deletes learner work: removing a page learners have answered is refused.",
        {"properties": {"activity_uuid": {"type": "string"}, "document": _DOCUMENT, "base_etag": {"type": "string"}}, "required": ["activity_uuid", "document", "base_etag"]},
        handlers.save_activity,
        scope="activities:write",
        read_only=False,
    ),
    Tool(
        "list_plan_templates",
        "List plan templates",
        "List the plan templates in the connected organization with their size and how often they have been assigned. Start here to find the template an admin is talking about.",
        {"properties": {"query": {"type": "string", "description": "Optional case-insensitive filter on name and description."}}},
        goal_templates.list_plan_templates,
        scope="plans:read",
    ),
    Tool(
        "get_plan_template",
        "Get a plan template",
        "Read one plan template as a Goal Template Document (details, roles and stages of typed steps with their schedule), plus its etag (needed to save).",
        {"properties": {"template_uuid": {"type": "string"}}, "required": ["template_uuid"]},
        goal_templates.get_plan_template,
        scope="plans:read",
    ),
    Tool(
        "get_plan_template_schema",
        "Plan template format guide",
        "Get the authoring guide and JSON Schema for Goal Template Documents: stages, step types, schedules, the badge it earns, badge steps and roles. Read it before writing or editing a template.",
        {"properties": {}},
        goal_templates.get_plan_template_schema,
        scope="plans:read",
    ),
    Tool(
        "validate_plan_template",
        "Validate a plan template",
        "Check a Goal Template Document against every server rule without saving. Returns all errors and warnings with JSON paths. Pass template_uuid when editing an existing template; omit it for a new one.",
        {"properties": {"document": _TEMPLATE_DOCUMENT, "template_uuid": {"type": "string"}}, "required": ["document"]},
        goal_templates.validate_plan_template,
        scope="plans:read",
    ),
    Tool(
        "save_plan_template",
        "Save a plan template",
        "Save a Goal Template Document over a plan template's draft. Requires the etag from get_plan_template (or the last save). Fails with the current document if someone changed the template since. New plans keep using the published version until publish_plan_template; plans already issued never change.",
        {"properties": {"template_uuid": {"type": "string"}, "document": _TEMPLATE_DOCUMENT, "base_etag": {"type": "string"}}, "required": ["template_uuid", "document", "base_etag"]},
        goal_templates.save_plan_template,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "create_plan_template",
        "Create a plan template",
        "Create a new plan template (as an unpublished draft) from a Goal Template Document. Omit keys for new stages and steps; a document read with get_plan_template can be passed to copy that template.",
        {"properties": {"document": _TEMPLATE_DOCUMENT}, "required": ["document"]},
        goal_templates.create_plan_template,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "list_plan_template_versions",
        "List plan template versions",
        "List a plan template's published versions (newest first), which one new plans are issued from, how many assignments each has, and whether the draft has unpublished changes.",
        {"properties": {"template_uuid": {"type": "string"}}, "required": ["template_uuid"]},
        goal_templates.list_plan_template_versions,
        scope="plans:read",
    ),
    Tool(
        "publish_plan_template",
        "Publish a plan template",
        "Publish the template's draft (its stages, steps and activities) as a new version. New assignments and learners joining from Discover get it, and its badge block is what finishing it earns; plans already issued keep their version, with their learners' answers. Only call this when the admin asks.",
        {"properties": {"template_uuid": {"type": "string"}, "note": {"type": "string", "description": "What changed, shown in the version history."}}, "required": ["template_uuid"]},
        goal_templates.publish_plan_template,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "restore_plan_template_version",
        "Roll back a plan template",
        "Roll back: publish an earlier version again as the newest version, so new plans are issued from it. Plans already issued and the template's draft are unchanged. Only call this when the admin asks.",
        {"properties": {"template_uuid": {"type": "string"}, "number": {"type": "integer"}, "note": {"type": "string"}}, "required": ["template_uuid", "number"]},
        goal_templates.restore_plan_template_version,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "set_objective_requirements",
        "Link a step to requirements",
        "Replace the requirement nodes one plan template step counts toward (the step's key; templates moved from plans also accept the old objective_uuid). Link leaf requirements (see list_requirement_frameworks). Use it to say that steps in different templates achieve the same thing.",
        {
            "properties": {
                "template_uuid": {"type": "string"},
                "step_key": {"type": "string", "description": "The step's key in the template document."},
                "objective_uuid": {"type": "string", "description": "Older name for step_key; templates moved from plans kept their objective uuids as step keys."},
                "node_uuids": {"type": "array", "items": {"type": "string"}, "description": "The full set; an empty list removes every link."},
            },
            "required": ["template_uuid", "node_uuids"],
        },
        goal_templates.set_objective_requirements,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "list_requirement_frameworks",
        "List requirement frameworks",
        "List the organization's requirement frameworks with every requirement node (code, title, whether it is a leaf). Template steps link to leaf nodes.",
        {"properties": {}},
        handlers.list_requirement_frameworks,
        scope="plans:read",
    ),
    Tool(
        "get_requirement_framework",
        "Get a requirement framework",
        "Read a requirement framework's working version as a Requirement Framework Document, plus its etag (needed to save), version history, the template steps linked to each node, and leaf requirements nothing links to yet.",
        {"properties": {"framework_uuid": {"type": "string"}}, "required": ["framework_uuid"]},
        handlers.get_requirement_framework,
        scope="plans:read",
    ),
    Tool(
        "get_requirement_framework_schema",
        "Requirement framework format guide",
        "Get the authoring guide and JSON Schema for Requirement Framework Documents: categories, numbering, met-when rules, fields, versions and publishing.",
        {"properties": {}},
        handlers.get_requirement_framework_schema,
        scope="plans:read",
    ),
    Tool(
        "validate_requirement_framework",
        "Validate a requirement framework",
        "Check a Requirement Framework Document against every rule without saving, including which linked steps an edit would affect. Pass framework_uuid when editing an existing framework.",
        {"properties": {"document": _FRAMEWORK_DOCUMENT, "framework_uuid": {"type": "string"}}, "required": ["document"]},
        handlers.validate_requirement_framework,
        scope="plans:read",
    ),
    Tool(
        "save_requirement_framework",
        "Save a requirement framework",
        "Save a Requirement Framework Document as the framework's working draft (a published version is never changed: saving over it starts a new draft). Requires the etag from get_requirement_framework. Does not publish.",
        {"properties": {"framework_uuid": {"type": "string"}, "document": _FRAMEWORK_DOCUMENT, "base_etag": {"type": "string"}}, "required": ["framework_uuid", "document", "base_etag"]},
        handlers.save_requirement_framework,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "create_requirement_framework",
        "Create a requirement framework",
        "Create a new requirement framework (as an unpublished draft) from a Requirement Framework Document.",
        {"properties": {"document": _FRAMEWORK_DOCUMENT}, "required": ["document"]},
        handlers.create_requirement_framework,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "publish_requirement_framework",
        "Publish a requirement framework",
        "Publish the framework's current draft so new enrollments use it. Learners already enrolled stay on their version. Only call this when the admin asks to publish.",
        {"properties": {"framework_uuid": {"type": "string"}}, "required": ["framework_uuid"]},
        handlers.publish_requirement_framework,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "search_library",
        "Search the global library",
        "Search the plan templates or requirement frameworks published to the shared Launch LMS library.",
        {"properties": {"kind": _LIBRARY_KIND, "query": {"type": "string"}}, "required": ["kind"]},
        goal_library.search_library,
        scope="plans:read",
    ),
    Tool(
        "copy_from_library",
        "Copy from the global library",
        "Copy a library plan template or requirement framework into the connected organization as an independent copy.",
        {"properties": {"kind": _LIBRARY_KIND, "uuid": {"type": "string", "description": "The library item's uuid from search_library."}}, "required": ["kind", "uuid"]},
        goal_library.copy_from_library,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "publish_to_library",
        "Publish to the global library",
        "Publish (or refresh) a snapshot of one of this organization's plan templates or published requirement frameworks to the shared library. Only the platform's owner organization can do this. Only call it when the admin asks.",
        {"properties": {"kind": _LIBRARY_KIND, "uuid": {"type": "string"},
                        "editable": {"type": "boolean", "description": "Frameworks only. False for an official standard: orgs use it as is and can't change it. Default true: orgs copy it as their own."},
                        "mode": _LISTING_MODE, "access": _LISTING_ACCESS},
         "required": ["kind", "uuid"]},
        goal_library.publish_to_library,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "list_collections",
        "List plan collections",
        "List the organization's plan collections with their plans, categories and whether each is a starter collection, plus the categories to pick from.",
        {"properties": {}},
        goal_collections.list_collections,
        scope="plans:read",
    ),
    Tool(
        "save_collection",
        "Save a plan collection",
        "Create a plan collection (omit collection_uuid) or change one. Collections group plans without owning them; their categories (up to 3) apply to every plan inside "
        "and decide where /start and Discover suggest them. `template_uuids` is the whole plan list when given. `starter` (platform organization only) makes the collection "
        "a category of the New plan picker every organization sees: its plans with a live version are offered as ready-to-edit copies. Only save when the admin asks.",
        {"properties": {
            "collection_uuid": {"type": "string"},
            "name": {"type": "string"},
            "description": {"type": "string"},
            "categories": {"type": "array", "items": {"type": "string"}, "description": "Up to 3, from list_collections' categories."},
            "starter": {"type": "boolean"},
            "template_uuids": {"type": "array", "items": {"type": "string"}},
        }},
        goal_collections.save_collection,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "set_plan_listing",
        "Set how a plan is shared",
        "List or unlist a plan's live version in Discover for other organizations (needs the plan publishing program), and say how they may use it: "
        "`mode` locked (assign as is, e.g. badge plans) or open (copy and change), `access` open (add without asking) or request. Only when the admin asks.",
        {"properties": {"template_uuid": {"type": "string"}, "listed": {"type": "boolean", "description": "Default true."}, "mode": _LISTING_MODE, "access": _LISTING_ACCESS},
         "required": ["template_uuid"]},
        goal_collections.set_plan_listing,
        scope="plans:write",
        read_only=False,
    ),
    Tool(
        "set_plan_cover",
        "Set a plan's cover",
        "Set the plan's cover image (a url from upload_media, or \"\" to go back to the icon), icon or color. Covers aren't versioned: every version shows the current one.",
        {"properties": {"template_uuid": {"type": "string"}, "thumbnail_image": {"type": "string"}, "icon": {"type": "string"}, "color": {"type": "string"}},
         "required": ["template_uuid"]},
        goal_collections.set_plan_cover,
        scope="plans:write",
        read_only=False,
    ),
    *MEDIA_TOOLS,
    *INSIGHTS_TOOLS,
    *COACH_TOOLS,
]
TOOLS_BY_NAME = {tool.name: tool for tool in TOOLS}
