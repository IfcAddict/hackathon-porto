This application is part of an openbim hackaton competition, thus a balance between speed and feature set must be reached.

The system takes an IFC file and an IDS that produces a number of BCF incidences using ifctester; or directly an IFC and some BCF incidences, and feeds the incidences to an AI agent that is capable of understanding what the problems are and interacting with the IFC file to solve them.

For the interaction with the IFC we have chosen ifcopenshell, as it is the most comprehensive and capable.

The application is written in python. And it will work locally. Local access and changes to the IFC file in a folder prefilled manually by the person invoking the agent with the IFC file. The person can also add BCF incidences as a source or the IDS. By using ifctester to validate the IFC, it will produce BCF files, be able to read them and produce fixes over a new copy of the IFC file, beside a summary of the fixes for human review. Or directly take the BCF incidences and act on the IFC file. The human should be able to accept or reject fixes.

For the agent harness we will use langgraph, no persistence needed for now, fully local. For developing and debugging we will use gemma3:1b to check the whole app flow, but for final use we'll use an openai, google or anthropic model. gemma3:1b is available through ollama running locally. It will have access to a run_python_script tool with ifcopenshell available and other necessary dependencies.

An extra feature is the ability to visualize the diff between the original IFC file and the result IFC produced by the AI agent after applying the proposed fixes. The goal of this visualization is to enable a human-in-the-loop so that a person can easily review the proposed changes by the AI and accept them or not. We won't tackle this now, but it will be next in our roadmap. For it we will use ifc-lite (https://github.com/louistrue/ifc-lite), a fast open source IFC visualizer.

/docs folder for documentation
/src folder for the main application
/source for the IFC, IDS or BCF files, to be filled by the human before invoking the agent
/output for the IFC copy with the fixes proposed by the AI

It should be set up in such a way that the repo could be cloned by someone else, it would be relatively easy to set it up working. Use an .env.template and a config.py mapping it.
