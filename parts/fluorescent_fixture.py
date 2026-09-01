from nurb import *

# A recessed fluorescent troffer for the cubicle stage.
# RENDER ASSET — never printed. Modelled +Z up with the diffuser opening at z=0.


@part
def fluorescent_fixture(
    width=900.0,
    depth=240.0,
    height=55.0,
    frame_width=24.0,
    corner_radius=12.0,
    draft=False,
):
    """
    width: fixture length across the ceiling
    depth: fixture width along the ceiling
    height: how far the metal tray rises into the ceiling
    frame_width: visible metal rim around the diffuser
    corner_radius: rounding on the manufactured outer corners
    """
    tray = Pos(0, 0, height / 2) * Box(width, depth, height)
    tray = fillet(tray.edges().filter_by(Axis.Z), corner_radius)

    # Cut upward from below but leave a shallow roof, producing a real rim and
    # inner wall for the diffuser light to catch rather than a luminous plane
    # floating directly on the ceiling.
    opening = Pos(0, 0, height * 0.38) * Box(
        width - frame_width * 2,
        depth - frame_width * 2,
        height * 0.82,
    )
    fixture = tray - opening

    if draft:
        return fixture
    return polish(fixture, fixture.edges(), 1.2)
