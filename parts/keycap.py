from nurb import *

# ONE keycap, modelled properly, for the talk's desk (src/scene/Props.jsx).
#
# RENDER ASSET — never printed. Ignore printability findings.
#
# Why one cap rather than a whole board: the scene instances this across a real
# layout with per-row tilt, so eighty caps cost one draw call and one build.
# Modelling eighty solids in the kernel would take minutes to build and buy
# nothing — every cap on a board is the same part.
#
# The previous version of this in JavaScript was `boxGeometry(1, 0.2, 0.62)`
# repeated in a grid, which read as a waffle. What makes a keycap read as a
# keycap is entirely in the details a Box cannot have: the sides taper inward,
# the top is DISHED so it catches a curved highlight instead of a flat one, and
# every edge is rounded rather than chamfered — caps are moulded and tumbled,
# not machined.
#
# Scale: mm. Standard 19.05mm key pitch.


@part
def keycap(
    base_width=18.0,
    top_width=14.2,
    cap_height=9.5,
    dish_depth=1.1,
    corner_radius=1.6,
    edge_round=0.9,
    draft=False,
):
    """
    base_width: how wide the cap is where it meets the board
    top_width: how wide the flat top is — smaller than the base, so it tapers
    cap_height: how tall the cap stands above the board
    dish_depth: how deeply the top is scooped for a fingertip
    corner_radius: how rounded the cap's corners are looking down on it
    edge_round: how softly the top edges are rounded over
    """

    # Tapered body: a loft from the base footprint up to the smaller top.
    with BuildPart() as body:
        with BuildSketch(Plane.XY):
            add(RectangleRounded(base_width, base_width, corner_radius))
        with BuildSketch(Plane.XY.offset(cap_height)):
            add(RectangleRounded(top_width, top_width, corner_radius * 0.8))
        loft(ruled=True)

    cap = body.part

    # The dish. A large-radius cylinder laid across the top and subtracted, so
    # the top surface is cylindrically concave — that scoop is what gives a cap
    # its curved specular streak instead of a flat panel highlight.
    dish_r = (top_width * top_width / 4 + dish_depth * dish_depth) / (2 * dish_depth)
    dish = Pos(0, 0, cap_height + dish_r - dish_depth) * Rot(0, 90, 0) * Cylinder(
        dish_r, base_width * 2
    )
    cap = cap - dish

    if draft:
        return cap

    # ROUNDED, not chamfered. The house default is a chamfer, but a keycap is a
    # moulded part with softened edges — a chamfered cap looks machined and
    # wrong. Applied to the top edges only; the base sits on the board.
    top_edges = cap.edges().filter_by(
        lambda e: e.bounding_box().min.Z > cap_height * 0.25
    )
    return fillet(top_edges, edge_round)
