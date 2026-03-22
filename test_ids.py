import ifcopenshell
from ifctester import ids, reporter
import json

specs = ids.open('backend/rsc/Hackathon_2026_test.ids')
ifc_file = ifcopenshell.open('backend/rsc/ARK_NordicLCA_Housing_Concrete_As-Built_Revit.ifc')
specs.validate(ifc_file)

json_reporter = reporter.Json(specs)
results = json_reporter.report()

for spec in results.get('specifications', []):
    if not spec.get('status'):
        print(f"Spec: {spec.get('name')}")
        for req in spec.get('requirements', []):
            if not req.get('status'):
                fails = req.get('failed_entities', [])
                if len(fails) > 0:
                    print("  Sample dict keys:", fails[0].keys())
                    for k, v in fails[0].items():
                        if k != 'entity': # avoid printing full entity repr
                            print(f"    {k}: {v}")
                        else:
                            print(f"    {k}: {type(v)}")
                            if hasattr(v, 'GlobalId'):
                                print(f"    {k}.GlobalId: {v.GlobalId}")
                break
