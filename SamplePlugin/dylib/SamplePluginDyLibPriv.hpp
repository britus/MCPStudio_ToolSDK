//
//  SamplePluginDyLibPriv.hpp
//  SamplePluginDyLib

/* The classes below are not exported */
#pragma GCC visibility push(hidden)

class SamplePluginDyLibPriv
{
    public:
    void HelloWorldPriv(const char *);
};

#pragma GCC visibility pop
