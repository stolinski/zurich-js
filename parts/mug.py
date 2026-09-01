from nurb import *

# A mug, for the talk's desk (src/scene/Props.jsx).
#
# RENDER ASSET — never printed. Ignore printability findings.
#
# Revolved from a wall profile rather than built as a cylinder. The difference
# that matters is the RIM: a real mug's wall has thickness, so the rim is a
# narrow ring that catches a bright line all the way round, and you can see
# down inside it. A capped cylinder has neither — it reads as a tin can, which
# is exactly what the previous version looked like.
#
# Scale: mm. Sits with its base on z = 0.


@part
def mug(
    outer_diameter=84.0,
    height=96.0,
    wall=5.0,
    floor_thickness=9.0,
    taper=4.0,
    handle_reach=30.0,
    handle_thickness=9.0,
    draft=False,
):
    """
    outer_diameter: how wide the mug is across the rim
    height: how tall the mug stands
    wall: how thick the ceramic wall is — this is what makes the rim visible
    floor_thickness: how thick the base is under the coffee
    taper: how much narrower the base is than the rim
    handle_reach: how far the handle sticks out from the side
    handle_thickness: how thick the handle loop is
    """

    r_top = outer_diameter / 2
    r_base = r_top - taper

    # Outer shell as a revolve, so the side has a real taper.
    with BuildPart() as body:
        with BuildSketch(Plane.XZ) as prof:
            with BuildLine():
                Polyline(
                    (0, 0),
                    (r_base, 0),
                    (r_top, height),
                    (0, height),
                    close=True,
                )
            make_face()
        revolve(axis=Axis.Z)

    cup = body.part

    # Hollow it: a second revolve, inset by the wall, sitting on the floor.
    inner_top = r_top - wall
    inner_base = r_base - wall
    with BuildPart() as cavity:
        with BuildSketch(Plane.XZ):
            with BuildLine():
                Polyline(
                    (0, floor_thickness),
                    (inner_base, floor_thickness),
                    (inner_top, height + 1),
                    (0, height + 1),
                    close=True,
                )
            make_face()
        revolve(axis=Axis.Z)

    cup = cup - cavity.part

    # Handle: a torus section standing in the XZ plane, pushed out to the wall.
    handle_r = handle_reach
    handle = (
        Pos(r_top - handle_thickness * 0.4, 0, height * 0.55)
        * Rot(90, 0, 0)
        * Torus(handle_r, handle_thickness / 2)
    )
    # Trim the half that would sit inside the cup.
    inside = Pos(-outer_diameter, 0, 0) * Box(
        outer_diameter * 2, outer_diameter * 2, height * 3
    )
    handle = handle - inside
    cup = cup + handle

    if draft:
        return cup

    # Just the base rim. The mouth's rim is left crisp on purpose: that hard
    # bright ring is the read.
    base = cup.edges().filter_by(Plane.XY).filter_by(
        lambda e: e.bounding_box().max.Z < 1.0
    )
    return fillet(base, 1.8)
